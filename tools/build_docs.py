"""tools/build_docs.py - build SCOREKEEPER-STARTUP-GUIDE.html from the Markdown.

The Markdown file is the one to edit; this turns it into the styled HTML page
(which tools/make_pdfs.js then prints to PDF).

Developer tool. Needs Python 3 and the 'markdown' package:
    pip install markdown
    python3 tools/build_docs.py
"""
import os
import re
import markdown

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'SCOREKEEPER-STARTUP-GUIDE.md')
OUT = os.path.join(ROOT, 'SCOREKEEPER-STARTUP-GUIDE.html')
CSS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'guide-style.css')
TALL = {'bystat.png'}  # very tall screenshots are shown narrower

md = open(SRC, encoding='utf-8').read()

# Title "Product — Guide name" becomes the header; the setup-time line moves into it.
title_line, rest = md.split('\n', 1)
title = title_line.lstrip('# ').strip()
product, _, guide = title.partition(' — ')
setup = re.search(r'^Total setup time: (.+)$', rest, re.M)
rest = re.sub(r'^Total setup time: .+\n', '', rest, flags=re.M)
rest = re.sub(r'(?m)^---\s*$', '', rest)  # section breaks: the h2 bars already separate parts

# The converter wants 4-space indents for sub-lists and a blank line before a
# list that follows text (the .md uses GitHub's looser style).
rest = re.sub(r'(?m)^   ( *)- ', r'    \1- ', rest)
rest = re.sub(r'(?m)^(> [^\n-][^\n]*)\n(> - )', r'\1\n>\n\2', rest)
rest = re.sub(r'(?m)^([^\n>\s-][^\n]*:)\n(- )', r'\1\n\n\2', rest)

# Checklist "- [ ] item" -> class checklist
rest = re.sub(r'(?m)^- \[ \] ', '- ', rest)

html = markdown.markdown(rest, extensions=['tables', 'sane_lists'])

# Screenshots: a paragraph of images -> figures (several in a row side by side)
def figures(m):
    imgs = re.findall(r'<img alt="([^"]*)" src="([^"]*)" ?/?>', m.group(0))
    figs = ''.join('<figure class="shot %s"><img src="%s" alt="%s"><figcaption>%s</figcaption></figure>'
                   % ('tall' if os.path.basename(src) in TALL else '', src, alt, alt) for alt, src in imgs)
    return '<div class="shot-row">' + figs + '</div>' if len(imgs) > 1 else figs
html = re.sub(r'<p>(?:\s*<img [^>]*>\s*)+</p>', figures, html)

# Callouts (> ...) -> tip boxes
html = html.replace('<blockquote>', '<div class="tip">').replace('</blockquote>', '</div>')

# The checklist under "Game-day checklist"
html = re.sub(r'(<h2>Game-day checklist</h2>\s*)<ul>', r'\1<ul class="checklist">', html)

# Bare web addresses and the e-mail address -> links
html = re.sub(r'(?<!["=>])(https://[^\s<*]+[^\s<*.,)])', r'<a href="\1">\1</a>', html)
html = re.sub(r'(?<![:"\w])([\w.]+@[\w.]+\.\w+)', r'<a href="mailto:\1">\1</a>', html)

# Closing "Questions or anything looks off?" line -> contact bar
html = re.sub(r'<p><strong>(Questions or anything looks off\?.*?)</strong></p>', r'<div class="footer-contact">\1</div>', html, flags=re.S)

sub = guide + (' &nbsp;•&nbsp; Setup time: ' + setup.group(1) if setup else '')
page = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        '<title>' + title + '</title>\n'
        '<!-- Built from SCOREKEEPER-STARTUP-GUIDE.md by tools/build_docs.py: edit the .md, not this file. -->\n'
        '<style>\n' + open(CSS, encoding='utf-8').read() + '</style>\n</head>\n<body>\n\n'
        '<header>\n  <h1>' + product + '</h1>\n  <div class="sub">' + sub + '</div>\n</header>\n\n'
        + html + '\n\n</body>\n</html>\n')
open(OUT, 'w', encoding='utf-8').write(page)
print('wrote', os.path.relpath(OUT, ROOT))
