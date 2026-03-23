#!/usr/bin/env python3
"""
Website bug tester using Playwright.

Checks:
- page availability/status
- page load timing
- required selectors
- JavaScript console/page errors
- failed network requests
- broken internal links

Exit codes:
- 0: pass
- 1: fail
- 2: setup/runtime error
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

try:
    from playwright.async_api import Error as PlaywrightError
    from playwright.async_api import async_playwright
except ImportError:
    print(
        "Missing dependency: playwright\n"
        "Install with:\n"
        "  pip install playwright\n"
        "  python -m playwright install chromium"
    )
    sys.exit(2)


IGNORED_LINK_SCHEMES = ("mailto:", "tel:", "javascript:")


@dataclass
class Finding:
    name: str
    ok: bool
    severity: str
    details: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_base_url(raw_url: str) -> str:
    candidate = raw_url.strip()
    parsed = urlparse(candidate)
    if parsed.scheme:
        return candidate

    localhost_names = {"localhost", "127.0.0.1", "0.0.0.0"}
    host = candidate.split("/")[0].split(":")[0].lower()
    prefix = "http://" if host in localhost_names else "https://"
    return f"{prefix}{candidate}"


def normalize_paths(paths: list[str] | None) -> list[str]:
    if not paths:
        return ["/"]
    normalized: list[str] = []
    seen = set()
    for path in paths:
        value = path.strip()
        if not value:
            continue
        if not value.startswith("/"):
            value = f"/{value}"
        if value not in seen:
            normalized.append(value)
            seen.add(value)
    return normalized or ["/"]


def sanitize_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "_", value).strip("_") or "page"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Smoke test a website and flag likely bugs."
    )
    parser.add_argument("url", help="Base website URL, e.g. https://example.com")
    parser.add_argument(
        "--path",
        action="append",
        help="Path to test. Repeat for multiple paths. Default: /",
    )
    parser.add_argument(
        "--required-selector",
        action="append",
        default=[],
        help="CSS selector that must exist on every tested page.",
    )
    parser.add_argument(
        "--max-load-seconds",
        type=float,
        default=5.0,
        help="Fail if a tested page takes longer than this to load.",
    )
    parser.add_argument(
        "--max-links",
        type=int,
        default=30,
        help="Max internal links to validate from the first tested page.",
    )
    parser.add_argument(
        "--max-broken-links",
        type=int,
        default=0,
        help="Allowed number of broken internal links.",
    )
    parser.add_argument(
        "--max-console-errors",
        type=int,
        default=0,
        help="Allowed number of console/page JavaScript errors.",
    )
    parser.add_argument(
        "--max-request-failures",
        type=int,
        default=0,
        help="Allowed number of failed network requests.",
    )
    parser.add_argument(
        "--max-http-errors",
        type=int,
        default=0,
        help="Allowed number of HTTP 4xx/5xx responses across all resources.",
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=30000,
        help="Navigation and request timeout in milliseconds.",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Run browser in headed mode (visible window).",
    )
    parser.add_argument(
        "--screenshot-on-fail",
        action="store_true",
        help="Capture screenshots for pages that fail checks.",
    )
    parser.add_argument(
        "--report",
        default="output/playwright/website-test-report.json",
        help="Path to JSON report output.",
    )
    return parser.parse_args()


def to_json_ready(data: Any) -> Any:
    if isinstance(data, Path):
        return str(data)
    return data


def clip(text: str, max_chars: int = 220) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."


def normalize_internal_link(base_url: str, current_url: str, href: str) -> str | None:
    if not href:
        return None

    cleaned = href.strip()
    if not cleaned or cleaned.startswith("#"):
        return None

    lowered = cleaned.lower()
    if lowered.startswith(IGNORED_LINK_SCHEMES):
        return None

    absolute = urljoin(current_url, cleaned)
    parsed = urlparse(absolute)
    if parsed.scheme not in ("http", "https"):
        return None

    base_netloc = urlparse(base_url).netloc
    if parsed.netloc != base_netloc:
        return None

    # Keep path/query, drop fragments for stable de-duplication.
    normalized = urlunparse(
        (parsed.scheme, parsed.netloc, parsed.path or "/", parsed.params, parsed.query, "")
    )
    return normalized


async def run() -> int:
    args = parse_args()
    base_url = normalize_base_url(args.url)
    paths = normalize_paths(args.path)
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    findings: list[Finding] = []
    pages_report: list[dict[str, Any]] = []
    broken_links: list[dict[str, Any]] = []
    console_errors: list[dict[str, Any]] = []
    failed_requests: list[dict[str, Any]] = []
    http_errors: list[dict[str, Any]] = []
    screenshots: list[str] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not args.headed)
        context = await browser.new_context(ignore_https_errors=True)
        page = await context.new_page()

        def on_console(msg: Any) -> None:
            if msg.type == "error":
                console_errors.append(
                    {
                        "url": page.url,
                        "type": msg.type,
                        "text": clip(msg.text),
                    }
                )

        def on_page_error(err: Exception) -> None:
            console_errors.append(
                {
                    "url": page.url,
                    "type": "pageerror",
                    "text": clip(str(err)),
                }
            )

        def on_request_failed(req: Any) -> None:
            failed_requests.append(
                {
                    "url": req.url,
                    "method": req.method,
                    "failure": req.failure,
                }
            )

        def on_response(res: Any) -> None:
            if res.status >= 400:
                http_errors.append(
                    {
                        "url": res.url,
                        "status": res.status,
                        "resource_type": res.request.resource_type,
                    }
                )

        page.on("console", on_console)
        page.on("pageerror", on_page_error)
        page.on("requestfailed", on_request_failed)
        page.on("response", on_response)

        for path in paths:
            target_url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
            page_result: dict[str, Any] = {
                "path": path,
                "url": target_url,
                "ok": True,
                "status": None,
                "load_seconds": None,
                "title": None,
                "missing_selectors": [],
                "error": None,
            }

            try:
                started = perf_counter()
                response = await page.goto(
                    target_url, wait_until="networkidle", timeout=args.timeout_ms
                )
                elapsed = perf_counter() - started
                page_result["load_seconds"] = round(elapsed, 3)
                page_result["status"] = response.status if response else None
                page_result["title"] = await page.title()

                if page_result["status"] is None:
                    page_result["ok"] = False
                    findings.append(
                        Finding(
                            name=f"Main response present for {path}",
                            ok=False,
                            severity="error",
                            details=f"No response captured for {target_url}",
                        )
                    )
                elif page_result["status"] >= 400:
                    page_result["ok"] = False
                    findings.append(
                        Finding(
                            name=f"HTTP status for {path}",
                            ok=False,
                            severity="error",
                            details=f"Expected < 400, got {page_result['status']} for {target_url}",
                        )
                    )
                else:
                    findings.append(
                        Finding(
                            name=f"HTTP status for {path}",
                            ok=True,
                            severity="error",
                            details=f"{page_result['status']} for {target_url}",
                        )
                    )

                if elapsed > args.max_load_seconds:
                    page_result["ok"] = False
                    findings.append(
                        Finding(
                            name=f"Load time for {path}",
                            ok=False,
                            severity="error",
                            details=f"{elapsed:.2f}s exceeds limit {args.max_load_seconds:.2f}s",
                        )
                    )
                else:
                    findings.append(
                        Finding(
                            name=f"Load time for {path}",
                            ok=True,
                            severity="error",
                            details=f"{elapsed:.2f}s (limit {args.max_load_seconds:.2f}s)",
                        )
                    )

                for selector in args.required_selector:
                    count = await page.locator(selector).count()
                    if count == 0:
                        page_result["ok"] = False
                        page_result["missing_selectors"].append(selector)

                if page_result["missing_selectors"]:
                    findings.append(
                        Finding(
                            name=f"Required selectors for {path}",
                            ok=False,
                            severity="error",
                            details="Missing: " + ", ".join(page_result["missing_selectors"]),
                        )
                    )
                elif args.required_selector:
                    findings.append(
                        Finding(
                            name=f"Required selectors for {path}",
                            ok=True,
                            severity="error",
                            details=f"All {len(args.required_selector)} selector checks passed",
                        )
                    )

            except PlaywrightError as exc:
                page_result["ok"] = False
                page_result["error"] = clip(str(exc), 500)
                findings.append(
                    Finding(
                        name=f"Navigation for {path}",
                        ok=False,
                        severity="error",
                        details=clip(str(exc), 300),
                    )
                )
            finally:
                if args.screenshot_on_fail and not page_result["ok"]:
                    shot_dir = report_path.parent / "screenshots"
                    shot_dir.mkdir(parents=True, exist_ok=True)
                    shot_name = sanitize_filename(path.replace("/", "_"))
                    shot_path = shot_dir / f"{shot_name}.png"
                    try:
                        await page.screenshot(path=str(shot_path), full_page=True)
                        screenshots.append(str(shot_path))
                    except PlaywrightError:
                        pass

                pages_report.append(page_result)

        # Link validation from first tested page.
        first_page_url = pages_report[0]["url"] if pages_report else base_url
        try:
            await page.goto(first_page_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
            hrefs = await page.eval_on_selector_all(
                "a[href]",
                "els => els.map(el => el.getAttribute('href')).filter(Boolean)",
            )
            unique_internal: list[str] = []
            seen_links = set()
            for href in hrefs:
                normalized = normalize_internal_link(base_url, page.url, href)
                if normalized and normalized not in seen_links:
                    unique_internal.append(normalized)
                    seen_links.add(normalized)

            for link in unique_internal[: args.max_links]:
                try:
                    res = await context.request.get(
                        link,
                        timeout=args.timeout_ms,
                        fail_on_status_code=False,
                    )
                    if res.status >= 400:
                        broken_links.append({"url": link, "status": res.status})
                except PlaywrightError as exc:
                    broken_links.append({"url": link, "status": "request_failed", "error": clip(str(exc))})

            findings.append(
                Finding(
                    name="Broken internal links",
                    ok=len(broken_links) <= args.max_broken_links,
                    severity="error",
                    details=(
                        f"{len(broken_links)} broken (allowed {args.max_broken_links}) "
                        f"from {min(len(unique_internal), args.max_links)} checked links"
                    ),
                )
            )
        except PlaywrightError as exc:
            findings.append(
                Finding(
                    name="Internal link scan",
                    ok=False,
                    severity="error",
                    details=f"Failed to collect/check internal links: {clip(str(exc), 300)}",
                )
            )

        await browser.close()

    findings.append(
        Finding(
            name="Console/page JS errors",
            ok=len(console_errors) <= args.max_console_errors,
            severity="error",
            details=f"{len(console_errors)} found (allowed {args.max_console_errors})",
        )
    )
    findings.append(
        Finding(
            name="Failed network requests",
            ok=len(failed_requests) <= args.max_request_failures,
            severity="error",
            details=f"{len(failed_requests)} failed (allowed {args.max_request_failures})",
        )
    )
    findings.append(
        Finding(
            name="HTTP resource errors (4xx/5xx)",
            ok=len(http_errors) <= args.max_http_errors,
            severity="error",
            details=f"{len(http_errors)} found (allowed {args.max_http_errors})",
        )
    )

    overall_ok = all(item.ok for item in findings if item.severity == "error")

    report = {
        "started_at": utc_now_iso(),
        "target": base_url,
        "settings": {
            "paths": paths,
            "required_selector": args.required_selector,
            "max_load_seconds": args.max_load_seconds,
            "max_links": args.max_links,
            "max_broken_links": args.max_broken_links,
            "max_console_errors": args.max_console_errors,
            "max_request_failures": args.max_request_failures,
            "max_http_errors": args.max_http_errors,
            "timeout_ms": args.timeout_ms,
            "headed": args.headed,
            "screenshot_on_fail": args.screenshot_on_fail,
        },
        "summary": {
            "result": "PASS" if overall_ok else "FAIL",
            "findings_total": len(findings),
            "failed_findings": sum(1 for f in findings if not f.ok),
            "pages_tested": len(pages_report),
            "broken_links": len(broken_links),
            "console_errors": len(console_errors),
            "failed_requests": len(failed_requests),
            "http_errors": len(http_errors),
        },
        "findings": [asdict(finding) for finding in findings],
        "pages": pages_report,
        "artifacts": {
            "report_path": str(report_path),
            "screenshots": screenshots,
        },
        "samples": {
            "broken_links": broken_links[:20],
            "console_errors": console_errors[:20],
            "failed_requests": failed_requests[:20],
            "http_errors": http_errors[:20],
        },
    }

    report_path.write_text(
        json.dumps(report, indent=2, default=to_json_ready),
        encoding="utf-8",
    )

    print("\nWebsite Bug Tester")
    print(f"Target: {base_url}")
    print(f"Paths: {', '.join(paths)}")
    print(f"Result: {report['summary']['result']}")
    for finding in report["findings"]:
        status = "PASS" if finding["ok"] else "FAIL"
        print(f"[{status}] {finding['name']}: {finding['details']}")
    print(f"Report: {report_path}")

    return 0 if overall_ok else 1


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(run()))
    except KeyboardInterrupt:
        print("Interrupted by user.")
        raise SystemExit(130)
