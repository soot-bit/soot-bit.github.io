#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BOOK_DIR = REPO_ROOT / "book"
BOOK_BUILD_DIR = BOOK_DIR / "_build" / "html"
BLOG_SITE_DIR = REPO_ROOT / "blog"
TUTORIALS_REDIRECT_DIR = REPO_ROOT / "tutorials"


@dataclass(frozen=True)
class NotebookEntry:
  slug: str
  title: str
  src_path: Path


def _run(cmd: list[str], cwd: Path | None = None) -> None:
  subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)


def _clone_tutorials(repo: str, dest: Path) -> Path:
  checkout = dest / "Tutorials"
  _run(["git", "clone", "--depth", "1", repo, str(checkout)])
  return checkout


def _slugify(stem: str) -> str:
  # Keep stable slugs close to current URLs and readable.
  # e.g. LinearRegression -> linear-regression
  out: list[str] = []
  for i, ch in enumerate(stem):
    prev = stem[i - 1] if i > 0 else ""
    if ch.isupper() and prev and (prev.islower() or prev.isdigit()):
      out.append("-")
    out.append(ch)
  s = "".join(out)
  s = s.replace("_", "-").replace(" ", "-")
  s = "".join([c if c.isalnum() or c == "-" else "-" for c in s])
  s = "-".join([p for p in s.split("-") if p]).lower().strip("-")
  return s or "tutorial"


def _title_from_filename(stem: str) -> str:
  # Basic title; notebooks can include their own H1 which will show in content.
  s = stem.replace("_", " ").replace("-", " ").strip()
  return " ".join([w.capitalize() if w.isalpha() else w for w in s.split()]) or "Tutorial"


def _discover_notebooks(src_dir: Path) -> list[NotebookEntry]:
  notebooks = []
  for ipynb in sorted(src_dir.glob("*.ipynb")):
    slug = _slugify(ipynb.stem)
    notebooks.append(NotebookEntry(slug=slug, title=_title_from_filename(ipynb.stem), src_path=ipynb))
  return notebooks


def _write_book_files(entries: list[NotebookEntry], repo_url: str) -> None:
  BOOK_DIR.mkdir(parents=True, exist_ok=True)

  (BOOK_DIR / "_config.yml").write_text(
    "\n".join(
      [
        "title: Blog",
        "author: Tlotlo Oepeng",
        f"repository:\n  url: {repo_url}\n  branch: main",
        "execute:",
        "  execute_notebooks: off",
        "html:",
        "  use_repository_button: true",
        "  use_issues_button: false",
        "  home_page_in_navbar: true",
        "launch_buttons:",
        "  colab_url: https://colab.research.google.com",
        "",
      ]
    ),
    encoding="utf-8",
  )

  (BOOK_DIR / "_toc.yml").write_text(
    "\n".join(
      [
        "format: jb-book",
        "root: index",
        "chapters:",
        *[f"  - file: {e.slug}" for e in entries],
        "",
      ]
    ),
    encoding="utf-8",
  )

  (BOOK_DIR / "index.md").write_text(
    "\n".join(
      [
        "# Blog",
        "",
        "Notebook-style posts on machine learning and data science.",
        "",
        f"- Source repo: {repo_url}",
        "- Main site: https://soot-bit.github.io/",
        "",
      ]
    ),
    encoding="utf-8",
  )


def _sync_notebooks(entries: list[NotebookEntry], dest_dir: Path) -> None:
  dest_dir.mkdir(parents=True, exist_ok=True)
  for e in entries:
    shutil.copyfile(e.src_path, dest_dir / f"{e.slug}.ipynb")


def _build_book() -> None:
  # Uses whatever python environment is running this script; recommended usage is via uv.
  _run(["jupyter-book", "build", str(BOOK_DIR)])


def _deploy_build_to_site() -> None:
  if not BOOK_BUILD_DIR.exists():
    raise RuntimeError(f"Expected build output at {BOOK_BUILD_DIR}")

  if BLOG_SITE_DIR.exists():
    shutil.rmtree(BLOG_SITE_DIR)
  shutil.copytree(BOOK_BUILD_DIR, BLOG_SITE_DIR)

  # GitHub Pages: avoid Jekyll processing.
  (REPO_ROOT / ".nojekyll").write_text("", encoding="utf-8")

  # Back-compat: /tutorials/ redirects to /blog/
  if TUTORIALS_REDIRECT_DIR.exists():
    shutil.rmtree(TUTORIALS_REDIRECT_DIR, ignore_errors=True)
  TUTORIALS_REDIRECT_DIR.mkdir(parents=True, exist_ok=True)
  (TUTORIALS_REDIRECT_DIR / "index.html").write_text(
    "\n".join(
      [
        "<!doctype html>",
        '<meta charset="utf-8" />',
        '<meta http-equiv="refresh" content="0; url=/blog/" />',
        '<link rel="canonical" href="/blog/" />',
        "<title>Redirecting…</title>",
        "<p>Redirecting to <a href=\"/blog/\">/blog/</a>…</p>",
        "",
      ]
    ),
    encoding="utf-8",
  )


def main() -> int:
  parser = argparse.ArgumentParser(description="Build a Jupyter Book from the Tutorials notebooks and deploy to /tutorials.")
  parser.add_argument("--repo", default="https://github.com/soot-bit/Tutorials.git", help="Tutorials repo URL to clone.")
  args = parser.parse_args()

  tmp = Path(tempfile.mkdtemp(prefix="tutorial-book-"))
  try:
    # Keep repo clean: rebuild book + deployed tutorials each run.
    if BOOK_DIR.exists():
      for child in BOOK_DIR.iterdir():
        if child.name in {".gitignore"}:
          continue
        if child.is_dir():
          shutil.rmtree(child)
        else:
          child.unlink()
    if (REPO_ROOT / "_build").exists():
      shutil.rmtree(REPO_ROOT / "_build", ignore_errors=True)
    if BLOG_SITE_DIR.exists():
      shutil.rmtree(BLOG_SITE_DIR, ignore_errors=True)

    src = _clone_tutorials(args.repo, tmp)
    entries = _discover_notebooks(src)
    if not entries:
      raise RuntimeError(f"No notebooks found in {src}")

    _write_book_files(entries, repo_url="https://github.com/soot-bit/Tutorials")
    _sync_notebooks(entries, BOOK_DIR)
    _build_book()
    _deploy_build_to_site()
    return 0
  finally:
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
  raise SystemExit(main())
