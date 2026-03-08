"""
GreenLight - Tee Time Availability Checker

Uses Playwright (headless Chromium) to load booking pages, intercept
the real API calls, and extract tee time data.

Booking systems:
  GolfNow    - api.gnsvc.com REST API (auth via cookies)
  Chronogolf - GET /marketplace/v2/teetimes (course UUIDs auto-discovered)
  ForeUP     - GET foreupsoftware.com/index.php/api/booking/times
  TeeSnap    - GET /customer-api/teetimes-day (AngularJS SPA)

Usage:
  python check_teetimes.py          # scan enabled courses from scan_config.json
  python check_teetimes.py --all    # scan ALL courses, ignore config
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")
CONFIG_PATH = os.path.join(SCRIPT_DIR, "scan_config.json")
os.makedirs(RESULTS_DIR, exist_ok=True)

TODAY = datetime.now().strftime("%Y-%m-%d")

# Scan the next 14 days by default (covers all near-term booking windows)
UPCOMING_DATES = [
    (datetime.now() + timedelta(days=d)).strftime("%Y-%m-%d")
    for d in range(1, 15)
]

# Will be populated at runtime from open rounds in Supabase
DATES_TO_CHECK: list[tuple[str, str]] = []  # [(label, "YYYY-MM-DD"), ...]

# ── Course configuration ────────────────────────────────────────────────
COURSES = [
    # GolfNow courses
    {
        "name": "Galloping Hill Golf Course",
        "key": "galloping_hill",
        "location": "Kenilworth, NJ",
        "system": "golfnow",
        "facility_id": 5095,
        "slug": "5095-galloping-hill-golf-course",
    },
    {
        "name": "Flanders Valley Golf Course",
        "key": "flanders_valley",
        "location": "Flanders, NJ",
        "system": "golfnow",
        "facility_id": 5151,
        "slug": "5151-flanders-valley-golf-course-blue-to-white",
    },
    {
        "name": "Neshanic Valley Golf Course",
        "key": "neshanic_valley",
        "location": "Neshanic Station, NJ",
        "system": "golfnow",
        "facility_id": 7083,
        "slug": "7083-neshanic-valley-golf-course",
    },
    {
        "name": "Rock Spring Golf Club",
        "key": "rock_spring",
        "location": "West Orange, NJ",
        "system": "golfnow",
        "facility_id": 19083,
        "slug": "19083-rock-spring-golf-club-at-west-orange",
    },
    {
        "name": "Cranbury Golf Club",
        "key": "cranbury",
        "location": "West Windsor, NJ",
        "system": "golfnow",
        "facility_id": 3250,
        "slug": "3250-cranbury-golf-club",
    },
    # Chronogolf courses
    {
        "name": "Francis A. Byrne Golf Course",
        "key": "francis_byrne",
        "location": "West Orange, NJ",
        "system": "chronogolf",
        "slug": "francis-byrne-golf-course",
        "course_uuid": None,  # auto-discovered
    },
    {
        "name": "Hendricks Field Golf Course",
        "key": "hendricks_field",
        "location": "Belleville, NJ",
        "system": "chronogolf",
        "slug": "hendricks-field-golf-course",
        "course_uuid": None,
    },
    {
        "name": "Weequahic Park Golf Course",
        "key": "weequahic_park",
        "location": "Newark, NJ",
        "system": "chronogolf",
        "slug": "weequahic-park-golf-course",
        "course_uuid": None,
    },
    {
        "name": "Skyway Golf Course",
        "key": "skyway",
        "location": "Jersey City, NJ",
        "system": "chronogolf",
        "slug": "skyway-golf-course",
        "course_uuid": None,
    },
    # ForeUP courses
    {
        "name": "Hominy Hill Golf Course",
        "key": "hominy_hill",
        "location": "Colts Neck, NJ",
        "system": "foreup",
        "course_id": 20155,
    },
    {
        "name": "Shark River Golf Course",
        "key": "shark_river",
        "location": "Neptune, NJ",
        "system": "foreup",
        "course_id": 20158,
    },
    {
        "name": "Mercer Oaks Golf Course",
        "key": "mercer_oaks",
        "location": "West Windsor, NJ",
        "system": "foreup",
        "course_id": 20965,
    },
    {
        "name": "Windsor Golf Club",
        "key": "windsor",
        "location": "Windsor, CA",
        "system": "foreup",
        "course_id": 19850,
        "schedule_id": 2751,
        "booking_class": 2430,
    },
    # TeeSnap courses
    {
        "name": "Healdsburg Golf Club",
        "key": "healdsburg",
        "location": "Healdsburg, CA",
        "system": "teesnap",
        "subdomain": "healdsburg",
        "course_id": 20,
    },
    # GolfNow – California
    {
        "name": "Baylands Golf Links",
        "key": "baylands",
        "location": "Palo Alto, CA",
        "system": "golfnow",
        "facility_id": 9259,
        "slug": "9259-baylands-golf-links",
    },
    {
        "name": "Moffett Field Golf Club",
        "key": "moffett_field",
        "location": "Mountain View, CA",
        "system": "golfnow",
        "facility_id": 13114,
        "slug": "13114-the-golf-club-at-moffett-field",
    },
    # Club Caddie courses
    {
        "name": "Shoreline Golf Links",
        "key": "shoreline",
        "location": "Mountain View, CA",
        "system": "clubcaddie",
        "course_id": 103422,
        "apikey": "bcfdabab",
    },
]

_ANALYTICS_SUBSTRINGS = [
    "google-analytics", "googletagmanager", "facebook",
    "cloudflare", "exacttarget", "onetrust", "golfid.io",
    "beacon.min.js", "sentry",
]

# Maps scraper course key -> Supabase courses.slug
COURSE_SLUG_MAP = {
    "galloping_hill": "galloping-hill",
    "flanders_valley": "flanders-valley",
    "neshanic_valley": "neshanic-valley",
    "rock_spring": "rock-spring",
    "cranbury": "cranbury",
    "francis_byrne": "francis-byrne",
    "hendricks_field": "hendricks-field",
    "weequahic_park": "weequahic",
    "skyway": "skyway",
    "hominy_hill": "hominy-hill",
    "shark_river": "shark-river",
    "mercer_oaks": "mercer-oaks",
    "healdsburg": "healdsburg",
    "windsor": "windsor",
    "baylands": "baylands",
    "moffett_field": "moffett-field",
    "shoreline": "shoreline",
}


def _is_analytics(url):
    return any(s in url for s in _ANALYTICS_SUBSTRINGS)


def _load_config():
    """Load scan_config.json. Returns config dict or None if missing."""
    if not os.path.exists(CONFIG_PATH):
        return None
    with open(CONFIG_PATH) as f:
        return json.load(f)


def _filter_courses(courses, config):
    """Return only courses enabled in the config."""
    if not config or not config.get("global_enabled", True):
        return []
    course_flags = config.get("courses", {})
    return [c for c in courses if course_flags.get(c["key"], {}).get("enabled", False)]


def _build_dates_to_check():
    """Build the list of dates to scan: next 14 days + any open round dates from Supabase."""
    global DATES_TO_CHECK

    dates = set(UPCOMING_DATES)

    # Also include dates from open rounds (may be beyond the 14-day window)
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if supabase_url and supabase_key:
        try:
            from supabase import create_client
            sb = create_client(supabase_url, supabase_key)
            resp = (
                sb.table("rounds")
                .select("round_date")
                .eq("status", "open")
                .gte("round_date", TODAY)
                .execute()
            )
            for row in (resp.data or []):
                rd = row.get("round_date")
                if rd:
                    dates.add(rd)
            print(f"  Open-round dates from Supabase: {len(resp.data or [])} rounds")
        except Exception as e:
            print(f"  Warning: could not fetch round dates from Supabase: {e}")

    # Sort chronologically and assign labels (use the date itself as label)
    sorted_dates = sorted(dates)
    DATES_TO_CHECK = [(d, d) for d in sorted_dates]

    print(f"  Dates to check: {', '.join(d for _, d in DATES_TO_CHECK)}")


def run(scan_all=False):
    config = _load_config()

    if scan_all:
        active_courses = list(COURSES)
        print("GreenLight - Tee Time Availability Checker (--all mode)")
    else:
        active_courses = _filter_courses(COURSES, config)
        print("GreenLight - Tee Time Availability Checker")

    print(f"Run: {datetime.now().isoformat()}")
    _build_dates_to_check()
    print(f"Courses: {len(active_courses)} of {len(COURSES)} enabled\n")

    if not active_courses:
        print("No courses enabled. Edit scan_config.json or use --all.")
        return

    # Group courses by booking system
    by_system = {}
    for c in active_courses:
        by_system.setdefault(c["system"], []).append(c)

    all_results = {}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
        )

        if "golfnow" in by_system:
            all_results.update(check_golfnow(context, by_system["golfnow"]))
        if "chronogolf" in by_system:
            all_results.update(check_chronogolf(context, by_system["chronogolf"]))
        if "foreup" in by_system:
            all_results.update(check_foreup(context, by_system["foreup"]))
        if "teesnap" in by_system:
            all_results.update(check_teesnap(context, by_system["teesnap"]))
        if "clubcaddie" in by_system:
            all_results.update(check_clubcaddie(context, by_system["clubcaddie"]))

        browser.close()

    # Save per-course JSON files and combined findings
    for key, result in all_results.items():
        _save(result, f"{key}.json")
    findings = _build_findings(all_results)
    _save(findings, "findings.json")

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    for course in active_courses:
        result = all_results.get(course["key"])
        if result:
            _print_summary(course["name"], result)
    print(f"\nResults saved to {RESULTS_DIR}/")

    # Notifications
    _notify(all_results, config)

    # Sync to Supabase
    _sync_to_supabase(all_results, active_courses)

    # Check for matching rounds and send email/SMS alerts
    _check_round_matches()


# =========================================================================
# GolfNow
# =========================================================================

def check_golfnow(context, courses):
    """Check all GolfNow courses. Returns {key: result} dict."""
    print("=" * 70)
    print(f"GOLFNOW ({len(courses)} courses)")
    print("=" * 70)

    results = {}
    page = context.new_page()

    for course in courses:
        print(f"\n--- {course['name']} ({course['location']}) ---")

        result = {
            "course": course["name"],
            "location": course["location"],
            "system": "GolfNow",
            "facility_id": course["facility_id"],
            "checked_at": datetime.now().isoformat(),
            "dates_checked": {},
        }

        api_calls = []
        api_responses = []

        def on_request(req):
            if req.resource_type in ("xhr", "fetch"):
                api_calls.append({"method": req.method, "url": req.url})

        def on_response(resp):
            if resp.request.resource_type not in ("xhr", "fetch"):
                return
            ct = resp.headers.get("content-type", "")
            entry = {"url": resp.url, "status": resp.status, "content_type": ct}
            if "json" in ct:
                try:
                    body = resp.json()
                    entry["body_keys"] = (
                        list(body.keys()) if isinstance(body, dict)
                        else f"array[{len(body)}]" if isinstance(body, list)
                        else type(body).__name__
                    )
                    entry["body_preview"] = json.dumps(body, indent=2)[:3000]
                except Exception:
                    pass
            api_responses.append(entry)

        page.on("request", on_request)
        page.on("response", on_response)

        for label, date in DATES_TO_CHECK:
            print(f"\n  [{label}] Loading {date}...")
            date_result = _golfnow_load_date(page, course["slug"], date)
            result["dates_checked"][label] = date_result

        interesting_calls = [c for c in api_calls if not _is_analytics(c["url"])]
        result["api_calls_captured"] = interesting_calls

        interesting_responses = [
            r for r in api_responses
            if r.get("body_keys") and not _is_analytics(r["url"])
        ]
        result["api_responses"] = interesting_responses

        print(f"\n  XHR/Fetch calls intercepted: {len(interesting_calls)}")
        for c in interesting_calls:
            print(f"    {c['method']} {c['url'][:120]}")
        if interesting_responses:
            print(f"  JSON responses captured: {len(interesting_responses)}")
            for r in interesting_responses:
                print(f"    [{r['status']}] {r['url'][:100]} -> keys: {r.get('body_keys')}")

        # Remove listeners before next course
        page.remove_listener("request", on_request)
        page.remove_listener("response", on_response)
        api_calls.clear()
        api_responses.clear()

        results[course["key"]] = result

    page.screenshot(path=os.path.join(RESULTS_DIR, "golfnow.png"))
    print(f"\n  Screenshot: golfnow.png")
    page.close()
    return results


def _golfnow_load_date(page, slug, date):
    """Load GolfNow facility page and extract tee time data."""
    url = f"https://www.golfnow.com/tee-times/facility/{slug}/search"
    date_result = {"date": date, "url": url, "tee_times": [], "status": "unknown"}

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)

        try:
            page.click("button:has-text('Continue'), button:has-text('Accept')", timeout=3000)
        except PwTimeout:
            pass

        try:
            page.wait_for_selector(
                ".facility-results, [class*='no-results'], [class*='NoResults']",
                timeout=15000,
            )
        except PwTimeout:
            pass

        page.wait_for_timeout(5000)

        tee_times = _extract_golfnow_teetimes(page)
        date_result["tee_times"] = tee_times
        date_result["tee_time_count"] = len(tee_times)

        try:
            date_display = page.inner_text(
                "[class*='date-picker'], [class*='datepicker'], .picker"
            )
            date_result["displayed_date"] = date_display.strip()[:50]
        except Exception:
            pass

        page_text = page.inner_text("body")
        for phrase in ["no tee times", "no results", "not available", "course is closed", "currently closed"]:
            if phrase in page_text.lower():
                date_result["status"] = "no_availability"
                date_result["message"] = phrase
                break
        else:
            date_result["status"] = "ok" if tee_times else "no_teetimes_found"

        print(f"    Status: {date_result['status']}")
        if date_result.get("displayed_date"):
            print(f"    Displayed date: {date_result['displayed_date']}")
        print(f"    Tee times: {len(tee_times)}")
        if tee_times:
            for tt in tee_times[:5]:
                print(f"      {tt.get('time', '?')} | {tt.get('price', '?')} | {tt.get('holes', '?')}h | {tt.get('players', '?')}p")
            if len(tee_times) > 5:
                print(f"      ... and {len(tee_times) - 5} more")

    except Exception as e:
        date_result["status"] = "error"
        date_result["error"] = str(e)
        print(f"    Error: {e}")

    return date_result


def _extract_golfnow_teetimes(page):
    """Extract tee time data from the rendered GolfNow page."""
    tee_times = []

    selectors = [
        ".rate-group", "[class*='rate-group']",
        ".tee-time-card", "[class*='tee-time-card']",
        "[class*='teetime']",
        "[data-teetime]", "[data-rateid]",
    ]

    for selector in selectors:
        try:
            elements = page.query_selector_all(selector)
            for el in elements:
                text = el.inner_text().strip()
                if not text:
                    continue
                tt = _parse_tee_time_text(text)
                if tt.get("time") or tt.get("price"):
                    tee_times.append(tt)
            if tee_times:
                break
        except Exception:
            continue

    if not tee_times:
        try:
            body = page.inner_text("body")
            for m in re.finditer(r'(\d{1,2}:\d{2}\s*[AaPp][Mm]).*?(\$[\d,.]+)', body, re.DOTALL):
                tee_times.append({"time": m.group(1).strip(), "price": m.group(2)})
        except Exception:
            pass

    return tee_times


# =========================================================================
# Chronogolf
# =========================================================================

def check_chronogolf(context, courses):
    """Check all Chronogolf courses. Returns {key: result} dict."""
    print("\n" + "=" * 70)
    print(f"CHRONOGOLF ({len(courses)} courses)")
    print("=" * 70)

    results = {}
    page = context.new_page()

    for course in courses:
        print(f"\n--- {course['name']} ({course['location']}) ---")

        result = {
            "course": course["name"],
            "location": course["location"],
            "system": "Chronogolf / Lightspeed",
            "checked_at": datetime.now().isoformat(),
            "club_metadata": {},
            "dates_checked": {},
        }

        # Step 1: Load club page for metadata + discover course UUID
        print("\n  [meta] Loading club page...")
        metadata = _chronogolf_load_club(page, course["slug"])
        result["club_metadata"] = metadata

        # Resolve the course UUID (auto-discover from __NEXT_DATA__)
        course_uuid = course.get("course_uuid")
        if not course_uuid and metadata.get("courses"):
            course_uuid = metadata["courses"][0].get("uuid")
            print(f"    Auto-discovered course UUID: {course_uuid}")

        result["course_uuid"] = course_uuid

        if not course_uuid:
            print("    WARNING: No course UUID found, skipping tee time checks")
            result["dates_checked"] = {
                label: {"date": d, "status": "error", "error": "no course UUID"}
                for label, d in DATES_TO_CHECK
            }
            results[course["key"]] = result
            continue

        # Intercept marketplace API responses
        api_responses = []

        def on_response(resp):
            if "marketplace/v2" not in resp.url:
                return
            entry = {"url": resp.url, "status": resp.status}
            try:
                body = resp.json()
                entry["body"] = body
            except Exception:
                pass
            api_responses.append(entry)

        page.on("response", on_response)

        # Step 2: Load teetimes page for each date
        for label, date in DATES_TO_CHECK:
            print(f"\n  [{label}] Checking {date}...")
            api_responses.clear()
            date_result = _chronogolf_load_teetimes(page, course["slug"], date, api_responses)
            result["dates_checked"][label] = date_result

        # Step 3: Direct API call
        print(f"\n  [direct_api] Calling marketplace API directly...")
        result["direct_api_test"] = _chronogolf_direct_api(page, course_uuid, DATES_TO_CHECK[0][1])

        page.remove_listener("response", on_response)
        results[course["key"]] = result

    page.screenshot(path=os.path.join(RESULTS_DIR, "chronogolf.png"))
    print(f"\n  Screenshot: chronogolf.png")
    page.close()
    return results


def _chronogolf_load_club(page, slug):
    """Load club page and extract metadata from __NEXT_DATA__."""
    url = f"https://www.chronogolf.com/club/{slug}"
    metadata = {"url": url, "success": False}

    try:
        page.goto(url, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        el = page.query_selector("#__NEXT_DATA__")
        if el:
            nd = json.loads(el.inner_text())
            club = nd.get("props", {}).get("pageProps", {}).get("club", {})
            features = club.get("features", {})

            metadata.update({
                "success": True,
                "name": club.get("name"),
                "id": club.get("id"),
                "uuid": club.get("uuid"),
                "phone": club.get("phone"),
                "address": club.get("address"),
                "city": club.get("city"),
                "province": club.get("province"),
                "online_booking_enabled": features.get("onlineBookingEnabled"),
                "booking_range_days": features.get("defaultPublicBookingRange"),
                "payment_option": features.get("paymentOption"),
                "cancel_range_hours": features.get("cancelReservationTimeRange"),
                "courses": [
                    {"name": c.get("name"), "id": c.get("id"), "uuid": c.get("uuid"), "holes": c.get("nbHoles")}
                    for c in club.get("courses", [])
                ],
                "affiliation_types": [
                    {"name": a.get("name"), "id": a.get("id")}
                    for a in club.get("affiliationTypes", [])
                ],
            })

            print(f"    Club: {metadata['name']}")
            print(f"    Online booking: {metadata['online_booking_enabled']}")
            print(f"    Booking range: {metadata['booking_range_days']} days")
            print(f"    Courses: {[c['name'] for c in metadata['courses']]}")
        else:
            print(f"    No __NEXT_DATA__ found")
    except Exception as e:
        metadata["error"] = str(e)
        print(f"    Error: {e}")

    return metadata


def _chronogolf_load_teetimes(page, slug, date, api_responses):
    """Load the teetimes page and capture the marketplace API response."""
    url = (
        f"https://www.chronogolf.com/club/{slug}/teetimes"
        f"?date={date}&nb_holes=18"
    )
    date_result = {"date": date, "url": url, "tee_times": [], "status": "unknown"}

    try:
        page.goto(url, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(5000)

        for resp in api_responses:
            if "marketplace/v2/teetimes" in resp.get("url", ""):
                body = resp.get("body", {})
                date_result["api_url"] = resp["url"]
                date_result["api_status_code"] = resp["status"]
                date_result["course_status"] = body.get("status")
                raw_teetimes = body.get("teetimes", [])
                date_result["tee_time_count"] = len(raw_teetimes)

                if raw_teetimes:
                    date_result["tee_times"] = raw_teetimes[:20]
                    date_result["tee_time_sample_keys"] = (
                        list(raw_teetimes[0].keys()) if isinstance(raw_teetimes[0], dict) else None
                    )
                    date_result["status"] = "ok"
                elif body.get("status") == "closed":
                    date_result["status"] = "closed"
                else:
                    date_result["status"] = "no_availability"
                break

        dom_teetimes = _extract_chronogolf_teetimes(page)
        date_result["dom_tee_times"] = dom_teetimes
        date_result["dom_tee_time_count"] = len(dom_teetimes)

        page_text = page.inner_text("body")
        for phrase in ["reservations available soon", "not available online", "contact the course", "closed"]:
            if phrase in page_text.lower():
                date_result["page_message"] = phrase
                if date_result["status"] == "unknown":
                    date_result["status"] = "booking_disabled"
                break

        if date_result["status"] == "unknown":
            date_result["status"] = "ok" if (dom_teetimes or date_result["tee_times"]) else "no_teetimes_found"

        print(f"    Course status: {date_result.get('course_status', 'n/a')}")
        print(f"    API tee times: {date_result.get('tee_time_count', 0)}")
        print(f"    DOM tee times: {len(dom_teetimes)}")
        if date_result.get("page_message"):
            print(f"    Page message: {date_result['page_message']}")
        if date_result.get("tee_time_sample_keys"):
            print(f"    Tee time fields: {date_result['tee_time_sample_keys']}")
        if date_result["tee_times"]:
            for tt in date_result["tee_times"][:3]:
                if isinstance(tt, dict):
                    print(f"      {tt.get('start_time', tt.get('time', '?'))} | ${tt.get('green_fee', tt.get('price', '?'))}")

    except Exception as e:
        date_result["status"] = "error"
        date_result["error"] = str(e)
        print(f"    Error: {e}")

    return date_result


def _chronogolf_direct_api(page, course_uuid, date):
    """Call the Chronogolf marketplace API directly using the browser session."""
    api_url = (
        f"https://www.chronogolf.com/marketplace/v2/teetimes"
        f"?start_date={date}&course_ids={course_uuid}&holes=18&page=1"
    )
    result = {"url": api_url, "success": False}

    try:
        body = page.evaluate("""
            async (url) => {
                const resp = await fetch(url, {
                    headers: { 'Accept': 'application/json' },
                    credentials: 'include',
                });
                return { status: resp.status, body: await resp.json() };
            }
        """, api_url)

        result["success"] = True
        result["http_status"] = body["status"]
        result["course_status"] = body["body"].get("status")
        result["tee_time_count"] = len(body["body"].get("teetimes", []))
        result["response"] = body["body"]

        if result["tee_time_count"] > 0 and isinstance(body["body"]["teetimes"][0], dict):
            result["tee_time_fields"] = list(body["body"]["teetimes"][0].keys())

        print(f"    URL: {api_url}")
        print(f"    HTTP {body['status']} | course: {result['course_status']} | teetimes: {result['tee_time_count']}")
        if result.get("tee_time_fields"):
            print(f"    Fields: {result['tee_time_fields']}")
    except Exception as e:
        result["error"] = str(e)
        print(f"    Error: {e}")

    return result


def _extract_chronogolf_teetimes(page):
    """Extract tee time data from the rendered Chronogolf DOM."""
    tee_times = []
    selectors = [
        "[class*='teetime']", "[class*='tee-time']",
        "[class*='time-slot']", "[class*='slot-card']",
        "[class*='availability']",
    ]
    for selector in selectors:
        try:
            for el in page.query_selector_all(selector):
                text = el.inner_text().strip()
                if text:
                    tt = _parse_tee_time_text(text)
                    if tt.get("time"):
                        tee_times.append(tt)
            if tee_times:
                break
        except Exception:
            continue
    return tee_times


# =========================================================================
# ForeUP
# =========================================================================

def check_foreup(context, courses):
    """Check all ForeUP courses. Returns {key: result} dict."""
    print("\n" + "=" * 70)
    print(f"FOREUP ({len(courses)} courses)")
    print("=" * 70)

    results = {}
    page = context.new_page()

    for course in courses:
        print(f"\n--- {course['name']} ({course['location']}) ---")

        result = {
            "course": course["name"],
            "location": course["location"],
            "system": "ForeUP",
            "course_id": course["course_id"],
            "checked_at": datetime.now().isoformat(),
            "dates_checked": {},
        }

        # Load the booking page to establish session/cookies
        schedule_id = course.get("schedule_id", "")
        booking_class = course.get("booking_class", "")
        booking_url = f"https://foreupsoftware.com/index.php/booking/{course['course_id']}"
        print(f"\n  Loading booking page: {booking_url}")
        try:
            page.goto(booking_url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(3000)

            # If a booking class is configured, click the "Public" button
            # to establish the correct session context
            if booking_class:
                try:
                    public_btn = page.get_by_text("Public", exact=True).first
                    public_btn.click()
                    page.wait_for_timeout(3000)
                    print(f"    Selected 'Public' booking class ({booking_class})")
                except Exception:
                    print(f"    Could not click booking class button, continuing")
        except Exception as e:
            print(f"    Error loading booking page: {e}")

        for label, date in DATES_TO_CHECK:
            print(f"\n  [{label}] Checking {date}...")
            date_result = _foreup_check_date(page, course["course_id"], date, schedule_id, booking_class)
            result["dates_checked"][label] = date_result

        results[course["key"]] = result

    page.screenshot(path=os.path.join(RESULTS_DIR, "foreup.png"))
    print(f"\n  Screenshot: foreup.png")
    page.close()
    return results


def _foreup_check_date(page, course_id, date, schedule_id="", booking_class=""):
    """Call the ForeUP tee times API via in-browser fetch."""
    # ForeUP expects MM-DD-YYYY date format
    parts = date.split("-")  # YYYY-MM-DD
    foreup_date = f"{parts[1]}-{parts[2]}-{parts[0]}"
    api_url = (
        f"https://foreupsoftware.com/index.php/api/booking/times"
        f"?time=all&date={foreup_date}&holes=18&players=0"
        f"&booking_class={booking_class}&schedule_id={schedule_id}&specials_only=0&api_key=no_limits"
    )
    date_result = {"date": date, "api_url": api_url, "tee_times": [], "status": "unknown"}

    try:
        raw = page.evaluate("""
            async (url) => {
                const resp = await fetch(url, {
                    headers: { 'Accept': 'application/json' },
                    credentials: 'include',
                });
                return { status: resp.status, body: await resp.text() };
            }
        """, api_url)

        date_result["http_status"] = raw["status"]

        try:
            body = json.loads(raw["body"])
        except json.JSONDecodeError:
            date_result["status"] = "error"
            date_result["error"] = f"Non-JSON response: {raw['body'][:200]}"
            print(f"    Error: non-JSON response (HTTP {raw['status']})")
            return date_result

        # ForeUP returns an array of tee time objects
        if isinstance(body, list):
            tee_times = []
            for slot in body:
                tt = {
                    "time": slot.get("time", ""),
                    "start_front": slot.get("start_front", ""),
                    "price": slot.get("green_fee") or slot.get("price", ""),
                    "holes": slot.get("holes"),
                    "players_available": slot.get("available_spots") or slot.get("max_players"),
                    "booking_class": slot.get("booking_class", ""),
                }
                # Clean up the time display
                if tt["time"] or tt["start_front"]:
                    tee_times.append(tt)

            # Validate dates — ForeUP `time` field can embed a date.
            # If that date doesn't match the requested date, the API
            # returned the wrong day's data; discard those results.
            if tee_times:
                sample_time = tee_times[0].get("time", "")
                m = re.match(r'^(\d{4}-\d{2}-\d{2})', sample_time)
                if m and m.group(1) != date:
                    actual = m.group(1)
                    print(f"    WARNING: API returned times for {actual}, not {date} — discarding {len(tee_times)} entries")
                    date_result["status"] = "wrong_date"
                    date_result["actual_date"] = actual
                    date_result["discarded_count"] = len(tee_times)
                    tee_times = []

            date_result["tee_times"] = tee_times
            date_result["tee_time_count"] = len(tee_times)
            if date_result["status"] != "wrong_date":
                date_result["status"] = "ok" if tee_times else "no_availability"

            if body:
                date_result["tee_time_sample_keys"] = list(body[0].keys()) if isinstance(body[0], dict) else None

        elif isinstance(body, dict):
            # Some error or status response
            date_result["response"] = body
            if body.get("message"):
                date_result["message"] = body["message"]
            date_result["status"] = "closed" if "closed" in str(body).lower() else "no_availability"
        else:
            date_result["status"] = "unknown_format"
            date_result["response_type"] = type(body).__name__

        print(f"    HTTP {raw['status']} | Status: {date_result['status']}")
        print(f"    Tee times: {date_result.get('tee_time_count', 0)}")
        if date_result.get("tee_time_sample_keys"):
            print(f"    Fields: {date_result['tee_time_sample_keys']}")
        if date_result["tee_times"]:
            for tt in date_result["tee_times"][:5]:
                print(f"      {tt.get('time', '?')} | ${tt.get('price', '?')} | {tt.get('holes', '?')}h | {tt.get('players_available', '?')} spots")
            if len(date_result["tee_times"]) > 5:
                print(f"      ... and {len(date_result['tee_times']) - 5} more")

    except Exception as e:
        date_result["status"] = "error"
        date_result["error"] = str(e)
        print(f"    Error: {e}")

    return date_result


# =========================================================================
# TeeSnap
# =========================================================================

def check_teesnap(context, courses):
    """Check all TeeSnap courses. Returns {key: result} dict.

    TeeSnap API (discovered):
      GET /customer-api/teetimes-day?course={id}&date=YYYY-MM-DD&players=4&holes=18&addons=on
      Returns: {"teeTimes": {"bookings": [...], "slots": [...], ...}}
    """
    print("\n" + "=" * 70)
    print(f"TEESNAP ({len(courses)} courses)")
    print("=" * 70)

    results = {}
    page = context.new_page()

    for course in courses:
        print(f"\n--- {course['name']} ({course['location']}) ---")

        subdomain = course["subdomain"]
        course_id = course["course_id"]
        base_url = f"https://{subdomain}.teesnap.net"

        result = {
            "course": course["name"],
            "location": course["location"],
            "system": "TeeSnap",
            "subdomain": subdomain,
            "course_id": course_id,
            "checked_at": datetime.now().isoformat(),
            "dates_checked": {},
        }

        # Load the booking page once to establish session
        print(f"\n  Loading booking page: {base_url}")
        try:
            page.goto(base_url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(3000)
        except Exception as e:
            print(f"    Error loading page: {e}")

        # Call the API directly for each date
        for label, date in DATES_TO_CHECK:
            print(f"\n  [{label}] Checking {date}...")
            date_result = _teesnap_check_date(page, base_url, course_id, date)
            result["dates_checked"][label] = date_result

        results[course["key"]] = result

    page.screenshot(path=os.path.join(RESULTS_DIR, "teesnap.png"))
    print(f"\n  Screenshot: teesnap.png")
    page.close()
    return results


def _teesnap_check_date(page, base_url, course_id, date):
    """Call the TeeSnap teetimes-day API via in-browser fetch."""
    api_url = (
        f"{base_url}/customer-api/teetimes-day"
        f"?course={course_id}&date={date}&players=4&holes=18&addons=on"
    )
    date_result = {"date": date, "api_url": api_url, "tee_times": [], "status": "unknown"}

    try:
        raw = page.evaluate("""
            async (url) => {
                const resp = await fetch(url, {
                    headers: { 'Accept': 'application/json' },
                    credentials: 'include',
                });
                return { status: resp.status, body: await resp.text() };
            }
        """, api_url)

        date_result["http_status"] = raw["status"]

        try:
            body = json.loads(raw["body"])
        except json.JSONDecodeError:
            date_result["status"] = "error"
            date_result["error"] = f"Non-JSON response: {raw['body'][:200]}"
            print(f"    Error: non-JSON response (HTTP {raw['status']})")
            return date_result

        tee_times_data = body.get("teeTimes", {})

        # TeeSnap nests available slots under teeTimes.teeTimes[]
        # Each slot: {teeTime, prices[], teeOffSections[], rackRateName, ...}
        raw_slots = tee_times_data.get("teeTimes", [])
        bookings = tee_times_data.get("bookings", [])
        tee_times = []

        for slot in raw_slots:
            tee_time_iso = slot.get("teeTime", "")
            # Parse ISO time to display format
            time_display = ""
            if tee_time_iso:
                try:
                    dt = datetime.fromisoformat(tee_time_iso)
                    time_display = dt.strftime("%I:%M %p").lstrip("0")
                except Exception:
                    time_display = tee_time_iso

            # Check if any section is held (unavailable)
            is_held = any(
                sec.get("isHeld", False)
                for sec in slot.get("teeOffSections", [])
            )

            # Get 18-hole price (prefer) or 9-hole
            prices = slot.get("prices", [])
            price_18 = next((p["price"] for p in prices if p.get("roundType") == "EIGHTEEN_HOLE"), None)
            price_9 = next((p["price"] for p in prices if p.get("roundType") == "NINE_HOLE"), None)

            tt = {
                "time": time_display,
                "tee_time_iso": tee_time_iso,
                "price_18": price_18,
                "price_9": price_9,
                "rate": slot.get("rackRateName", ""),
                "is_held": is_held,
            }
            tee_times.append(tt)

        # Filter to available (not held) slots
        available = [t for t in tee_times if not t["is_held"]]

        date_result["tee_times"] = tee_times[:30]  # save first 30
        date_result["tee_time_count"] = len(tee_times)
        date_result["available_count"] = len(available)
        date_result["held_count"] = len(tee_times) - len(available)
        date_result["existing_bookings"] = len(bookings)

        if available:
            date_result["status"] = "ok"
        elif tee_times:
            date_result["status"] = "fully_booked"
        elif bookings:
            date_result["status"] = "booked_up"
        else:
            date_result["status"] = "no_availability"

        print(f"    HTTP {raw['status']} | Status: {date_result['status']}")
        print(f"    Tee times: {len(tee_times)} ({len(available)} available, {date_result['held_count']} held)")
        print(f"    Existing bookings: {len(bookings)}")
        if available:
            for tt in available[:5]:
                print(f"      {tt['time']} | 18h: ${tt.get('price_18', '?')} | 9h: ${tt.get('price_9', '?')} | {tt['rate']}")
            if len(available) > 5:
                print(f"      ... and {len(available) - 5} more available")

    except Exception as e:
        date_result["status"] = "error"
        date_result["error"] = str(e)
        print(f"    Error: {e}")

    return date_result


# =========================================================================
# Club Caddie
# =========================================================================

def check_clubcaddie(context, courses):
    """Check all Club Caddie courses via Playwright. Returns {key: result} dict."""
    print("\n" + "=" * 70)
    print(f"CLUB CADDIE ({len(courses)} courses)")
    print("=" * 70)

    results = {}
    page = context.new_page()

    for course in courses:
        print(f"\n--- {course['name']} ({course['location']}) ---")

        apikey = course["apikey"]
        base = "https://apimanager-cc11.clubcaddie.com"

        result = {
            "course": course["name"],
            "location": course["location"],
            "system": "ClubCaddie",
            "course_id": course["course_id"],
            "checked_at": datetime.now().isoformat(),
            "dates_checked": {},
        }

        # Load the booking page to establish session (page does JS redirect)
        first_date = DATES_TO_CHECK[0][1] if DATES_TO_CHECK else TODAY
        parts = first_date.split("-")
        cc_date = f"{parts[1]}%2F{parts[2]}%2F{parts[0]}"
        booking_url = f"{base}/webapi/view/{apikey}/slots?date={cc_date}&player=1&ratetype=any"
        print(f"\n  Loading booking page: {booking_url}")
        try:
            page.goto(booking_url, wait_until="domcontentloaded", timeout=30000)
            # Wait for the JS session redirect to complete and search form to appear
            page.wait_for_selector("#SearchForm", timeout=15000)
            page.wait_for_timeout(2000)
            print(f"    Page loaded, session established")
        except Exception as e:
            print(f"    Error loading page: {e}")

        for label, date in DATES_TO_CHECK:
            print(f"\n  [{label}] Checking {date}...")
            date_result = _clubcaddie_check_date(page, course, date)
            result["dates_checked"][label] = date_result

        results[course["key"]] = result

    page.screenshot(path=os.path.join(RESULTS_DIR, "clubcaddie.png"))
    print(f"\n  Screenshot: clubcaddie.png")
    page.close()
    return results


def _clubcaddie_check_date(page, course, date):
    """Fetch tee times from Club Caddie by triggering the search form via JS."""
    parts = date.split("-")
    cc_date = f"{parts[1]}/{parts[2]}/{parts[0]}"

    date_result = {"date": date, "tee_times": [], "status": "unknown"}

    try:
        # Use jQuery's AJAX (already loaded on the page) to call the same
        # endpoint the search form uses.  The page's intraction.js will
        # automatically append the Interaction (session) parameter.
        html = page.evaluate("""
            ({ cc_date, courseId, apikey }) => {
                return new Promise((resolve, reject) => {
                    $.ajax({
                        type: 'POST',
                        url: 'webapi/TeeTimes',
                        data: {
                            date: cc_date,
                            player: '1',
                            CourseId: courseId,
                            apikey: apikey,
                            holes: 'any',
                            fromtime: '4',
                            totime: '23',
                            minprice: '0',
                            maxprice: '9999',
                            HoleGroup: 'front',
                            ratetype: 'any',
                        },
                        success: function(data, textStatus, jqXHR) {
                            resolve({ status: jqXHR.status, body: data });
                        },
                        error: function(jqXHR, textStatus, errorThrown) {
                            resolve({ status: jqXHR.status || 0, body: jqXHR.responseText || '' });
                        },
                    });
                });
            }
        """, {"cc_date": cc_date, "courseId": str(course["course_id"]), "apikey": course["apikey"]})

        date_result["http_status"] = html["status"]
        body = html["body"] if isinstance(html["body"], str) else ""

        # Parse slot JSON from hidden form fields
        tee_times = []
        for match in re.findall(r'name="slot"\s+value="([^"]*)"', body):
            try:
                slot = json.loads(unquote(match))
            except (json.JSONDecodeError, ValueError):
                continue

            start_time = slot.get("StartTime", "")
            players = slot.get("PlayersAvailable", 0)
            lowest_price = slot.get("LowestPrice")

            tt = {
                "time": start_time[:5] if len(start_time) >= 5 else start_time,
                "start_time": start_time[:5] if len(start_time) >= 5 else start_time,
                "players_available": players,
                "price": lowest_price,
                "holes": 18,
            }
            tee_times.append(tt)

        date_result["tee_times"] = tee_times
        count = len(tee_times)
        date_result["status"] = "ok" if count > 0 else "no_availability"
        print(f"    HTTP {date_result.get('http_status', '?')} | Status: {date_result['status']}")
        print(f"    Tee times: {count}")
        if tee_times:
            for tt in tee_times[:5]:
                print(f"      {tt['time']} | ${tt['price']} | 18h | {tt['players_available']} spots")
            if count > 5:
                print(f"      ... and {count - 5} more")

    except Exception as e:
        date_result["status"] = "error"
        date_result["error"] = str(e)
        print(f"    Error: {e}")

    return date_result


# =========================================================================
# Shared helpers
# =========================================================================

def _parse_tee_time_text(text):
    """Parse a block of text for tee time details."""
    tt = {}
    m = re.search(r'(\d{1,2}:\d{2}\s*(?:[AaPp][Mm])?)', text)
    if m:
        tt["time"] = m.group(1).strip()
    m = re.search(r'\$[\d,.]+', text)
    if m:
        tt["price"] = m.group(0)
    m = re.search(r'(\d+)\s*[Hh]ole', text)
    if m:
        tt["holes"] = int(m.group(1))
    m = re.search(r'(\d+)\s*[Pp]layer', text)
    if m:
        tt["players"] = int(m.group(1))
    tt["raw_text"] = text[:200]
    return tt


def _save(data, filename):
    path = os.path.join(RESULTS_DIR, filename)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)


def _print_summary(label, result):
    dates = result.get("dates_checked", {})
    print(f"\n{label}:")
    for dl, dd in dates.items():
        count = dd.get("tee_time_count", 0)
        status = dd.get("status", "?")
        cstatus = dd.get("course_status", "")
        msg = dd.get("message") or dd.get("page_message") or ""
        line = f"  [{dl}] {dd.get('date')}: {status}"
        if cstatus:
            line += f" (course: {cstatus})"
        if count:
            line += f" - {count} tee times"
        if msg:
            line += f" - {msg}"
        print(line)

    direct = result.get("direct_api_test", {})
    if direct:
        print(f"  [direct_api] status={direct.get('course_status', 'n/a')}, teetimes={direct.get('tee_time_count', 'n/a')}")

    api_count = len(result.get("api_calls_captured", []))
    if api_count:
        print(f"  Network calls intercepted: {api_count}")


def _build_findings(all_results):
    findings = {"run_time": datetime.now().isoformat(), "courses": {}}
    for key, result in all_results.items():
        entry = {
            "system": result.get("system"),
            "course": result.get("course"),
            "location": result.get("location"),
            "dates_checked": {},
        }

        # System-specific IDs
        if result.get("facility_id"):
            entry["facility_id"] = result["facility_id"]
        if result.get("course_uuid"):
            entry["course_uuid"] = result["course_uuid"]
        if result.get("course_id"):
            entry["course_id"] = result["course_id"]

        # Booking metadata (Chronogolf)
        meta = result.get("club_metadata", {})
        if meta.get("online_booking_enabled") is not None:
            entry["online_booking_enabled"] = meta["online_booking_enabled"]

        # Dates
        for dl, dd in result.get("dates_checked", {}).items():
            entry["dates_checked"][dl] = {
                "date": dd.get("date"),
                "status": dd.get("status"),
                "tee_time_count": dd.get("tee_time_count", 0),
            }
            if dd.get("course_status"):
                entry["dates_checked"][dl]["course_status"] = dd["course_status"]

        # Direct API test (Chronogolf)
        direct = result.get("direct_api_test", {})
        if direct:
            entry["direct_api_test"] = {
                "success": direct.get("success"),
                "course_status": direct.get("course_status"),
                "tee_time_count": direct.get("tee_time_count"),
            }

        # GolfNow network stats
        if result.get("api_calls_captured"):
            entry["api_calls_intercepted"] = len(result["api_calls_captured"])
        if result.get("api_responses"):
            entry["api_responses_with_json"] = len(result["api_responses"])

        findings["courses"][key] = entry

    return findings


def _normalize_time(time_str):
    """Convert various time formats to HH:MM (24-hour)."""
    if not time_str:
        return None
    time_str = str(time_str).strip()

    # ISO datetime: "2026-02-18T07:30:00"
    if "T" in time_str:
        try:
            dt = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
            return dt.strftime("%H:%M")
        except (ValueError, TypeError):
            pass

    # Space-separated datetime: "2026-03-01 16:30" (ForeUP format)
    m = re.match(r'^\d{4}-\d{2}-\d{2}\s+(\d{1,2}:\d{2})$', time_str)
    if m:
        hm = m.group(1)
        parts = hm.split(":")
        return f"{int(parts[0]):02d}:{parts[1]}"

    # AM/PM formats: "7:30 AM", "7:30AM"
    clean = re.sub(r'\s+', ' ', time_str).strip()
    for fmt in ("%I:%M %p", "%I:%M%p"):
        try:
            dt = datetime.strptime(clean, fmt)
            return dt.strftime("%H:%M")
        except ValueError:
            continue

    # Already 24-hour: "07:30" or "7:30"
    m = re.match(r'^(\d{1,2}):(\d{2})$', time_str)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"

    return None


def _parse_price_cents(raw):
    """Convert a price value (string or number) to (cents, label). Returns (None, None) on failure."""
    if raw is None or raw == "" or raw == "?":
        return None, None

    label = str(raw)
    clean = label.replace("$", "").replace(",", "").strip()
    try:
        cents = int(round(float(clean) * 100))
        if "$" not in label:
            label = f"${float(clean):.2f}"
        return cents, label
    except (ValueError, TypeError):
        return None, label


def _build_booking_link(course, date):
    """Build a direct booking URL for the course."""
    system = course["system"]
    if system == "golfnow":
        return f"https://www.golfnow.com/tee-times/facility/{course['slug']}/search"
    elif system == "chronogolf":
        return f"https://www.chronogolf.com/club/{course['slug']}/teetimes?date={date}"
    elif system == "foreup":
        return f"https://foreupsoftware.com/index.php/booking/{course['course_id']}/teetimes"
    elif system == "teesnap":
        return f"https://{course['subdomain']}.teesnap.net"
    elif system == "clubcaddie":
        p = date.split("-")  # YYYY-MM-DD
        return f"https://apimanager-cc11.clubcaddie.com/webapi/view/{course['apikey']}/slots?date={p[1]}%2F{p[2]}%2F{p[0]}"
    return None


def _sync_to_supabase(all_results, active_courses):
    """Write scan results to Supabase. Non-fatal on failure."""
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "")

    if not supabase_url or not supabase_key:
        print("\nSupabase: skipping (SUPABASE_URL / SUPABASE_SERVICE_KEY not set)")
        return

    try:
        from supabase import create_client
        sb = create_client(supabase_url, supabase_key)

        # a) Fetch courses from DB, build slug -> UUID mapping
        courses_resp = sb.table("courses").select("id, slug").execute()
        slug_to_uuid = {row["slug"]: row["id"] for row in courses_resp.data}

        # Auto-create missing courses
        NEW_COURSES = {
            "baylands": {"name": "Baylands Golf Links", "region": "ca", "state": "CA", "city": "Palo Alto", "booking_system": "golfnow", "scan_enabled": True, "booking_url": "https://baylandsbw.ezlinksgolf.com/index.html#/search"},
            "moffett-field": {"name": "Moffett Field Golf Club", "region": "ca", "state": "CA", "city": "Mountain View", "booking_system": "golfnow", "scan_enabled": True, "booking_url": "https://moffettfielddaily.ezlinksgolf.com/index.html#/search"},
            "shoreline": {"name": "Shoreline Golf Links", "region": "ca", "state": "CA", "city": "Mountain View", "booking_system": "clubcaddie", "scan_enabled": True, "booking_url": "https://shoreline.clubcaddie.com"},
        }
        for slug, info in NEW_COURSES.items():
            if slug not in slug_to_uuid:
                row = {"slug": slug, **info}
                try:
                    resp = sb.table("courses").upsert(row, on_conflict="slug").execute()
                    if resp.data:
                        slug_to_uuid[slug] = resp.data[0]["id"]
                        print(f"  Supabase: created course '{slug}' ({info['name']})")
                except Exception as e:
                    print(f"  Supabase: failed to create course '{slug}': {e}")

        print(f"\nSupabase: {len(slug_to_uuid)} courses in database")

        # b) Build rows to upsert
        now_iso = datetime.now(timezone.utc).isoformat()
        rows = []
        dates_by_course_uuid = {}  # track which dates we checked per course

        for course in active_courses:
            db_slug = COURSE_SLUG_MAP.get(course["key"])
            if not db_slug:
                continue
            course_uuid = slug_to_uuid.get(db_slug)
            if not course_uuid:
                print(f"  Supabase: no DB entry for slug '{db_slug}', skipping")
                continue

            result = all_results.get(course["key"])
            if not result:
                continue

            checked_dates = []
            for label, dd in result.get("dates_checked", {}).items():
                tee_date = dd.get("date")
                if not tee_date:
                    continue
                checked_dates.append(tee_date)

                for tt in dd.get("tee_times", []):
                    # Skip held/unavailable TeeSnap slots
                    if tt.get("is_held"):
                        continue

                    time_24 = _normalize_time(
                        tt.get("tee_time_iso") or tt.get("time") or tt.get("start_time") or tt.get("start_front")
                    )
                    if not time_24:
                        continue

                    # Price
                    if course["system"] == "teesnap":
                        price_raw = tt.get("price_18") or tt.get("price_9")
                    else:
                        price_raw = tt.get("green_fee") or tt.get("price")
                    price_cents, price_label = _parse_price_cents(price_raw)

                    # Spots
                    spots = tt.get("players_available") or tt.get("players")

                    row = {
                        "course_id": course_uuid,
                        "tee_date": tee_date,
                        "tee_time": time_24,
                        "is_available": True,
                        "last_seen_at": now_iso,
                        "source_data": json.dumps(tt, default=str),
                    }
                    if price_cents is not None:
                        row["price_cents"] = price_cents
                    if price_label:
                        row["price_label"] = price_label
                    if spots is not None:
                        try:
                            row["spots_available"] = int(spots)
                        except (ValueError, TypeError):
                            pass
                    booking_link = _build_booking_link(course, tee_date)
                    if booking_link:
                        row["booking_link"] = booking_link

                    rows.append(row)

            if checked_dates:
                dates_by_course_uuid[course_uuid] = checked_dates

        # Upsert in batches of 100
        upserted = 0
        for i in range(0, len(rows), 100):
            chunk = rows[i:i + 100]
            sb.table("tee_times").upsert(
                chunk, on_conflict="course_id,tee_date,tee_time"
            ).execute()
            upserted += len(chunk)
        print(f"  Supabase: upserted {upserted} tee times")

        # c) Mark stale tee times as unavailable (last_seen > 25 min ago)
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=25)).isoformat()
        stale_total = 0
        for course_uuid, dates in dates_by_course_uuid.items():
            for d in dates:
                resp = (
                    sb.table("tee_times")
                    .update({"is_available": False})
                    .eq("course_id", course_uuid)
                    .eq("tee_date", d)
                    .eq("is_available", True)
                    .lt("last_seen_at", cutoff)
                    .execute()
                )
                stale_total += len(resp.data) if resp.data else 0
        print(f"  Supabase: marked {stale_total} stale tee times as unavailable")

    except Exception as e:
        print(f"\nSupabase sync error: {e}")


def _notify(all_results, config):
    """Send email notification if any course has available tee times."""
    # General alerts disabled — use app for notifications
    # Match emails (_check_round_matches) are still active
    print("\nGeneral alerts disabled (use app for notifications)")
    return

    if not config:
        return

    notify_cfg = config.get("notify", {})
    api_key = os.environ.get("RESEND_API_KEY") or notify_cfg.get("resend_api_key", "")
    to_email = os.environ.get("NOTIFY_EMAIL") or notify_cfg.get("email", "")
    from_email = notify_cfg.get("from_email", "GreenLight <onboarding@resend.dev>")

    if not api_key or api_key.startswith("re_YOUR"):
        return
    if not to_email or to_email == "you@example.com":
        return

    # Collect courses with available tee times
    alerts = []
    for key, result in all_results.items():
        for label, dd in result.get("dates_checked", {}).items():
            count = dd.get("tee_time_count", 0)
            available = dd.get("available_count", count)  # TeeSnap tracks this separately
            if available > 0 and dd.get("status") == "ok":
                alerts.append({
                    "course": result.get("course"),
                    "location": result.get("location"),
                    "system": result.get("system"),
                    "date": dd.get("date"),
                    "label": label,
                    "count": available,
                    "tee_times": dd.get("tee_times", [])[:10],
                })

    if not alerts:
        print("\nNo available tee times to notify about.")
        return

    # Build email body
    subject = f"GreenLight: {len(alerts)} tee time alert(s)"
    lines = [
        f"GreenLight found available tee times at {len(alerts)} course/date combination(s):\n",
    ]
    for a in alerts:
        lines.append(f"## {a['course']} - {a['location']}")
        lines.append(f"Date: {a['date']} | System: {a['system']} | Available: {a['count']}")
        for tt in a["tee_times"][:5]:
            if isinstance(tt, dict):
                time = tt.get("time", tt.get("tee_time_iso", "?"))
                price = tt.get("price") or tt.get("price_18") or tt.get("green_fee") or "?"
                lines.append(f"  {time} - ${price}")
        if a["count"] > 5:
            lines.append(f"  ... and {a['count'] - 5} more")
        lines.append("")
    lines.append(f"Scan time: {datetime.now().isoformat()}")
    body = "\n".join(lines)

    print(f"\nSending alert email to {to_email} ({len(alerts)} alerts)...")
    print(f"  [DEBUG _notify] from_email = '{from_email}'")
    print(f"  [DEBUG _notify] RESEND_API_KEY exists = {bool(api_key)}, len = {len(api_key)}, source = {'env' if os.environ.get('RESEND_API_KEY') else 'config'}")
    try:
        import urllib.request
        payload = json.dumps({
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "text": body,
        }).encode()
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "GreenLight/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            print(f"  Email sent: {result.get('id', 'ok')}")
    except Exception as e:
        print(f"  Email send failed: {e}")


def _format_time_ampm(time_24):
    """Convert 'HH:MM' to '7:30 AM' format."""
    try:
        dt = datetime.strptime(time_24, "%H:%M")
        return dt.strftime("%I:%M %p").lstrip("0")
    except Exception:
        return time_24


def _format_date_friendly(date_str):
    """Convert 'YYYY-MM-DD' to 'Sat, Mar 15' format."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        # strftime %e not available on all platforms, use lstrip
        day = dt.strftime("%d").lstrip("0")
        return dt.strftime(f"%a, %b {day}")
    except Exception:
        return date_str


def _send_sms(twilio_sid, twilio_token, twilio_phone, to_phone, message):
    """Send an SMS via Twilio. Returns True on success."""
    try:
        from twilio.rest import Client
        client = Client(twilio_sid, twilio_token)
        msg = client.messages.create(
            body=message,
            from_=twilio_phone,
            to=to_phone,
        )
        print(f"    Twilio: sent {msg.sid}")
        return True
    except Exception as e:
        print(f"    Twilio error: {e}")
        return False


def _send_match_email(to_email, course_name, time_display, date_display,
                      price_display, spots_display, booking_url, round_id,
                      from_email="GreenLight <onboarding@resend.dev>"):
    """Send match notification email via Resend."""
    api_key = os.environ.get("RESEND_API_KEY", "")
    # Free-tier onboarding@resend.dev can only deliver to the Resend account email
    to_email = os.environ.get("NOTIFY_EMAIL") or to_email
    if not api_key or api_key.startswith("re_YOUR"):
        print("    Email: no Resend API key configured")
        return False

    subject = f"\U0001f3cc\ufe0f Tee time found! {time_display} at {course_name}"

    # Build detail line: "Wed, Feb 25 · $30.00 · 4 spots"
    details = date_display
    if price_display:
        details += f" \u00b7 {price_display}"
    if spots_display:
        details += f" \u00b7 {spots_display} spots"

    text = (
        f"\U0001f3cc\ufe0f Tee time found for your round!\n\n"
        f"{time_display} at {course_name}\n"
        f"{details}\n\n"
        f"Book now: {booking_url}\n"
        f"View round: https://the-starter.vercel.app/round/{round_id}\n"
    )

    try:
        import urllib.request
        payload = json.dumps({
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "text": text,
        }).encode()
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "GreenLight/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            print(f"    Email sent: {result.get('id', 'ok')}")
            return True
    except Exception as e:
        print(f"    Email send failed: {e}")
        return False


def _send_rsvp_email(to_email, creator_name, time_display, course_name,
                     date_display, share_code, price_display="",
                     from_email="GreenLight <onboarding@resend.dev>"):
    """Send RSVP notification email via Resend."""
    api_key = os.environ.get("RESEND_API_KEY", "")
    # Free-tier onboarding@resend.dev can only deliver to the Resend account email
    to_email = os.environ.get("NOTIFY_EMAIL") or to_email
    if not api_key or api_key.startswith("re_YOUR"):
        return False

    subject = f"\U0001f3cc\ufe0f {creator_name} found a tee time!"
    share_link = f"https://the-starter.vercel.app/r/{share_code}"

    details = date_display
    if price_display:
        details += f" \u00b7 {price_display}"

    text = (
        f"\U0001f3cc\ufe0f {creator_name} found a tee time!\n\n"
        f"{time_display} at {course_name}\n"
        f"{details}\n\n"
        f"View round: {share_link}\n"
    )

    try:
        import urllib.request
        payload = json.dumps({
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "text": text,
        }).encode()
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "GreenLight/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            print(f"    Email sent: {result.get('id', 'ok')}")
            return True
    except Exception as e:
        print(f"    Email send failed: {e}")
        return False


def _check_round_matches():
    """Check for matching tee times for open watching rounds and send notifications."""
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
    twilio_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
    twilio_phone = os.environ.get("TWILIO_PHONE_NUMBER", "")

    # Load from_email from config (same source as the working alert email)
    config = _load_config()
    notify_cfg = config.get("notify", {}) if config else {}
    from_email = notify_cfg.get("from_email", "GreenLight <onboarding@resend.dev>")

    if not supabase_url or not supabase_key:
        print("\nMatching: skipping (Supabase not configured)")
        return

    try:
        from supabase import create_client
        sb = create_client(supabase_url, supabase_key)

        today = datetime.now().strftime("%Y-%m-%d")

        # Query open watching rounds (no match yet, not past)
        rounds_resp = (
            sb.table("rounds")
            .select("*")
            .eq("status", "open")
            .eq("has_specific_time", False)
            .gte("round_date", today)
            .is_("matched_tee_time_id", "null")
            .execute()
        )

        open_rounds = rounds_resp.data or []
        print(f"\nMatching: checking {len(open_rounds)} open rounds...")

        if not open_rounds:
            return

        sms_sent = 0
        MAX_SMS_PER_CYCLE = 5

        for round_data in open_rounds:
            round_id = round_data["id"]

            # Get round's courses
            rc_resp = (
                sb.table("round_courses")
                .select("course_id")
                .eq("round_id", round_id)
                .execute()
            )
            course_ids = [rc["course_id"] for rc in (rc_resp.data or [])]
            if not course_ids:
                continue

            # Query matching tee times
            tt_resp = (
                sb.table("tee_times")
                .select("*")
                .in_("course_id", course_ids)
                .eq("tee_date", round_data["round_date"])
                .gte("tee_time", round_data["time_window_start"])
                .lte("tee_time", round_data["time_window_end"])
                .eq("is_available", True)
                .order("tee_time")
                .limit(20)
                .execute()
            )

            # Filter by spots_needed (spots_available can be null = unlimited)
            spots_needed = round_data.get("spots_needed", 1)
            match = None
            for tt in (tt_resp.data or []):
                if tt.get("spots_available") is None or tt["spots_available"] >= spots_needed:
                    match = tt
                    break

            if not match:
                continue

            print(f"  Round {round_id} matched with tee time {match['id']}")

            # Update round status
            now_iso = datetime.now(timezone.utc).isoformat()
            sb.table("rounds").update({
                "matched_tee_time_id": match["id"],
                "status": "found",
                "matched_at": now_iso,
            }).eq("id", round_id).execute()

            # Get creator profile
            creator_resp = (
                sb.table("profiles")
                .select("full_name, phone, sms_opt_in")
                .eq("id", round_data["creator_id"])
                .single()
                .execute()
            )
            creator = creator_resp.data

            # Get course name
            course_resp = (
                sb.table("courses")
                .select("name")
                .eq("id", match["course_id"])
                .single()
                .execute()
            )
            course_name = course_resp.data["name"] if course_resp.data else "Unknown Course"

            # Format display values
            time_display = _format_time_ampm(match["tee_time"])
            date_display = _format_date_friendly(round_data["round_date"])
            spots_display = match.get("spots_available")
            booking_url = match.get("booking_link", "")
            spots_text = f"{spots_display} spots available" if spots_display else "Spots available"

            # Notify creator — email first, SMS fallback
            creator_email = None
            try:
                user_resp = sb.auth.admin.get_user_by_id(round_data["creator_id"])
                creator_email = user_resp.user.email if user_resp and user_resp.user else None
            except Exception as e:
                print(f"    Could not get creator email: {e}")

            price_display = match.get("price_label", "")
            creator_notified = False

            if creator_email:
                creator_notified = _send_match_email(
                    creator_email, course_name, time_display, date_display,
                    price_display, spots_display, booking_url, round_id,
                    from_email=from_email,
                )

            # Build SMS detail line
            sms_details = date_display
            if price_display:
                sms_details += f" \u00b7 {price_display}"
            if spots_display:
                sms_details += f" \u00b7 {spots_display} spots"

            if not creator_notified and creator and creator.get("phone") and creator.get("sms_opt_in") and twilio_sid and twilio_token and twilio_phone:
                message = (
                    f"\U0001f3cc\ufe0f Tee time found!\n"
                    f"{time_display} at {course_name}\n"
                    f"{sms_details}\n"
                    f"Book now: {booking_url}\n"
                    f"Round: https://the-starter.vercel.app/round/{round_id}"
                )
                if _send_sms(twilio_sid, twilio_token, twilio_phone, creator["phone"], message):
                    sms_sent += 1

            # Notify RSVPs
            rsvp_resp = (
                sb.table("rsvps")
                .select("user_id, name")
                .eq("round_id", round_id)
                .eq("status", "in")
                .execute()
            )

            creator_name = (creator.get("full_name") or "Someone") if creator else "Someone"

            for rsvp in (rsvp_resp.data or []):
                if not rsvp.get("user_id"):
                    continue  # Guest RSVP, can't notify

                # Get RSVP user's email from auth.users
                rsvp_email = None
                try:
                    rsvp_user_resp = sb.auth.admin.get_user_by_id(rsvp["user_id"])
                    rsvp_email = rsvp_user_resp.user.email if rsvp_user_resp and rsvp_user_resp.user else None
                except Exception:
                    pass

                rsvp_notified = False
                if rsvp_email:
                    rsvp_notified = _send_rsvp_email(
                        rsvp_email, creator_name, time_display, course_name,
                        date_display, round_data["share_code"],
                        price_display=price_display,
                        from_email=from_email,
                    )

                if not rsvp_notified and twilio_sid and twilio_token and twilio_phone:
                    if sms_sent >= MAX_SMS_PER_CYCLE:
                        break
                    rsvp_profile_resp = (
                        sb.table("profiles")
                        .select("phone, sms_opt_in")
                        .eq("id", rsvp["user_id"])
                        .single()
                        .execute()
                    )
                    rsvp_profile = rsvp_profile_resp.data
                    if rsvp_profile and rsvp_profile.get("phone") and rsvp_profile.get("sms_opt_in"):
                        rsvp_message = (
                            f"\U0001f3cc\ufe0f {creator_name} found a tee time! "
                            f"{time_display} at {course_name} on {date_display}. "
                            f"Check it out: https://the-starter.vercel.app/r/{round_data['share_code']}"
                        )
                        if _send_sms(twilio_sid, twilio_token, twilio_phone, rsvp_profile["phone"], rsvp_message):
                            sms_sent += 1

        print(f"  Matching complete. {sms_sent} SMS sent this cycle.")

    except Exception as e:
        print(f"\nMatching error: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GreenLight Tee Time Scanner")
    parser.add_argument("--all", action="store_true", help="Scan ALL courses, ignore config")
    args = parser.parse_args()
    run(scan_all=args.all)
