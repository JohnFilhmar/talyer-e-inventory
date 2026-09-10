#!/usr/bin/env python3
"""Regenerate README's API endpoint list from the route files.

The list in README was maintained by hand and drifted badly: it documented eight
endpoints that did not exist and omitted about twenty that did, including every
`PATCH /:id/restore`. A hand-maintained list of 87 routes will drift again, so
this reads the routers instead.

Run from the repository root:

    python scripts/gen_endpoints.py            # print the section
    python scripts/gen_endpoints.py --check    # exit 1 if README is out of date

The mount prefixes are read from `server.js` rather than assumed, so moving a
router changes this output without anyone editing this file.
"""

import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ROUTES = os.path.join(ROOT, "backend", "src", "routes")
SERVER = os.path.join(ROOT, "backend", "src", "server.js")
README = os.path.join(ROOT, "README.md")

SECTION_TITLES = {
    "authRoutes.js": "Authentication",
    "userRoutes.js": "User Management",
    "branchRoutes.js": "Branch Management",
    "categoryRoutes.js": "Category Management",
    "motorcycleModelRoutes.js": "Motorcycle Model Management",
    "productRoutes.js": "Product Management",
    "stockRoutes.js": "Stock Management",
    "supplierRoutes.js": "Supplier Management",
    "salesRoutes.js": "Sales Management",
    "serviceRoutes.js": "Service Management",
}

ORDER = [
    "authRoutes.js", "userRoutes.js", "branchRoutes.js", "categoryRoutes.js",
    "motorcycleModelRoutes.js", "productRoutes.js", "stockRoutes.js",
    "supplierRoutes.js", "salesRoutes.js", "serviceRoutes.js",
]

VERBS = "get|post|put|patch|delete"


def mount_prefixes():
    """Map route module filename to the path server.js mounts it under."""
    server = io.open(SERVER, encoding="utf-8").read()
    var_to_path = dict(
        (m.group(2), m.group(1))
        for m in re.finditer(r"app\.use\('(/api/[^']+)',\s*apiLimiter,\s*(\w+)\)", server)
    )
    file_to_var = dict(
        (m.group(2), m.group(1))
        for m in re.finditer(r"import (\w+) from '\./routes/(\w+\.js)'", server)
    )
    return dict(
        (fname, var_to_path.get(var, "?")) for fname, var in file_to_var.items()
    )


def routes_in(path):
    """Every (VERB, path) the file declares, in source order.

    Two styles coexist. Most files call `router.get('/x', ...)` directly, with
    the path sometimes on the following line. The catalogue routers instead
    chain `router.route('/x').get(...).post(...)`, which is why a grep for
    `router.get(` reports zero routes for three of these files.
    """
    text = io.open(path, encoding="utf-8").read()
    lines = text.split("\n")
    found = []

    for i, line in enumerate(lines):
        m = re.match(r"\s*router\.(%s)\(\s*(?:'([^']*)')?" % VERBS, line)
        if not m:
            continue
        verb, p = m.group(1), m.group(2)
        if p is None:
            for j in range(i + 1, min(i + 4, len(lines))):
                m2 = re.match(r"\s*'([^']*)'", lines[j])
                if m2:
                    p = m2.group(1)
                    break
        if p is not None:
            found.append((verb.upper(), p, i))

    for m in re.finditer(r"router\s*\.route\('([^']*)'\)((?:\s*\.\w+\([^;]*?\))+);", text, re.S):
        line_no = text[:m.start()].count("\n")
        for vm in re.finditer(r"\.(%s)\(" % VERBS, m.group(2)):
            found.append((vm.group(1).upper(), m.group(1), line_no))

    found.sort(key=lambda t: t[2])
    seen, uniq = set(), []
    for verb, p, _ in found:
        if (verb, p) not in seen:
            seen.add((verb, p))
            uniq.append((verb, p))
    return uniq


def build():
    prefixes = mount_prefixes()
    out, total = [], 0
    for fname in ORDER:
        path = os.path.join(ROUTES, fname)
        if not os.path.exists(path):
            continue
        found = routes_in(path)
        out.append("### %s (`%s`)" % (SECTION_TITLES[fname], prefixes.get(fname, "?")))
        for verb, p in found:
            out.append("- `%s %s`" % (verb, p or "/"))
        out.append("")
        total += len(found)
    return "\n".join(out).rstrip("\n"), total


def main():
    body, total = build()
    if "--check" in sys.argv:
        readme = io.open(README, encoding="utf-8").read()
        missing = [ln for ln in body.split("\n") if ln.startswith("- `") and ln not in readme]
        if missing:
            print("README is out of date; %d generated entries are missing:" % len(missing))
            for ln in missing[:20]:
                print("  " + ln)
            return 1
        print("README lists all %d routes." % total)
        return 0
    print(body)
    print()
    print("TOTAL ROUTES: %d" % total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
