from pathlib import Path
import subprocess
import re

repo = Path(r"c:\Users\justy\Desktop\WWW\HarryEnglish v2\HarryEnglish v2")
path = repo / "src" / "components" / "AdminPortal.tsx"
current = path.read_text(encoding="utf-8")
head = subprocess.check_output(
    ["git", "show", "HEAD:src/components/AdminPortal.tsx"],
    cwd=repo,
).decode("utf-8")

def between(src: str, start: str, end: str, include_end: bool = False) -> str:
    a = src.find(start)
    if a < 0:
        raise SystemExit(f"missing start: {start[:80]!r}")
    b = src.find(end, a + len(start))
    if b < 0:
        raise SystemExit(f"missing end: {end[:80]!r}")
    return src[a : b + (len(end) if include_end else 0)]

# --- 1) state ---
if "complimentaryCandidates" not in current:
    state = between(
        head,
        "  const [complimentaryCandidates, setComplimentaryCandidates] = useState<",
        "  const [complimentarySearch, setComplimentarySearch] = useState('');\n",
    )
    needle = "  const [complimentaryParents, setComplimentaryParents] = useState<ComplimentaryParentRow[]>([]);\n"
    if needle not in current:
        raise SystemExit("parents state missing")
    # current already has complimentarySearch after parents
    if "  const [complimentarySearch, setComplimentarySearch] = useState('');\n" not in current[
        current.find(needle) : current.find(needle) + 400
    ]:
        raise SystemExit("search state not right after parents")
    current = current.replace(
        needle,
        needle + state,
        1,
    )

# --- 2) loadDiscounts type + setter ---
if "complimentaryCandidates?: typeof complimentaryCandidates" not in current:
    current = current.replace(
        "        complimentaryParents?: typeof complimentaryParents;\n        message?: string;",
        "        complimentaryParents?: typeof complimentaryParents;\n"
        "        complimentaryCandidates?: typeof complimentaryCandidates;\n"
        "        message?: string;",
        1,
    )

old_set = (
    "      setComplimentaryParents(\n"
    "        Array.isArray(data.complimentaryParents) ? data.complimentaryParents : [],\n"
    "      );\n"
    "    } catch (e) {\n"
    "      console.error('loadDiscounts', e);"
)
new_set = (
    "      setComplimentaryParents(\n"
    "        Array.isArray(data.complimentaryParents) ? data.complimentaryParents : [],\n"
    "      );\n"
    "      setComplimentaryCandidates(\n"
    "        Array.isArray(data.complimentaryCandidates) ? data.complimentaryCandidates : [],\n"
    "      );\n"
    "    } catch (e) {\n"
    "      console.error('loadDiscounts', e);"
)
if "setComplimentaryCandidates(" not in current.split("const loadDiscounts")[1][:2000]:
    if old_set not in current:
        raise SystemExit("loadDiscounts set block missing")
    current = current.replace(old_set, new_set, 1)

# --- 3) memos + effect ---
if "filteredComplimentaryCandidates" not in current:
    memos = between(
        head,
        "  const filteredComplimentaryCandidates = useMemo(",
        "  const filteredComplimentaryParents = useMemo(",
    )
    # insert BEFORE filteredComplimentaryParents
    fp = "  const filteredComplimentaryParents = useMemo("
    if fp not in current:
        raise SystemExit("filtered parents missing")
    current = current.replace(fp, memos + fp, 1)

    effect = between(
        head,
        "  useEffect(() => {\n"
        "    if (\n"
        "      selectedComplimentaryCandidateKey &&\n",
        "  const organizeFilterNameOptions = useMemo(",
    )
    # In HEAD effect is after filtered parents. In current organizeFilter may use groupsForOrganizeCascadedFilters.
    # Insert after filteredComplimentaryParents block.
    m = re.search(
        r"  const filteredComplimentaryParents = useMemo\(\n"
        r"    \(\) =>\n"
        r"      complimentaryParents\.filter\(\(parent\) =>\n"
        r"        matchesComplimentarySearch\(parent\.firstName, parent\.lastName, parent\.email\),\n"
        r"      \),\n"
        r"    \[complimentaryParents, matchesComplimentarySearch\],\n"
        r"  \);\n\n",
        current,
    )
    if not m:
        raise SystemExit("filtered parents block regex failed")
    current = current[: m.end()] + effect + current[m.end() :]

# --- 4) UI: replace simplified complimentary list section with HEAD version ---
# Find current simplified summary + list through end of parents list section
ui_start_marker = '                    <p className="mt-2 text-xs text-zinc-500">\n                      {complimentarySearch.trim()'
# HEAD UI from summary paragraph through add button section
head_ui = between(
    head,
    '                      <p className="mt-2 text-xs text-zinc-500">\n                        {complimentarySearch.trim()',
    "          {organizationSubTab === 'history' && (",
)

# Current file uses 4 fewer spaces in this area sometimes - find analogous end
cur_ui_start = current.find(ui_start_marker)
if cur_ui_start < 0:
    # try HEAD indentation
    ui_start_marker = '                      <p className="mt-2 text-xs text-zinc-500">\n                        {complimentarySearch.trim()'
    cur_ui_start = current.find(ui_start_marker)
if cur_ui_start < 0:
    raise SystemExit("UI start not found")

cur_ui_end = current.find("          {organizationSubTab === 'history' && (", cur_ui_start)
if cur_ui_end < 0:
    raise SystemExit("UI end not found")

current = current[:cur_ui_start] + head_ui + current[cur_ui_end:]

path.write_text(current, encoding="utf-8")
print("restored complimentary candidates")
print("has candidates state", "complimentaryCandidates" in path.read_text(encoding="utf-8"))
print("has Kandydaci", "Kandydaci" in path.read_text(encoding="utf-8"))
