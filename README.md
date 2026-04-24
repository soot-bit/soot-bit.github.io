# Tlotlo Oepeng — Personal Site

This repository hosts my GitHub Pages website (CV + tutorial notebooks).

- Live site: https://soot-bit.github.io
- Blog sources: https://github.com/soot-bit/Tutorials

## Local preview

```bash
uv run python -m http.server 8000
```

## Rebuild blog (Jupyter Book)

This repo publishes notebook posts as a Jupyter Book under `blog/`, sourced from:
https://github.com/soot-bit/Tutorials

```bash
uv run --with "jupyter-book==0.15.1" python tools/build_tutorial_book.py
```
