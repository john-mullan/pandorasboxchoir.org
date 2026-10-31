# Pandora’s Box website

Website files for pandorasboxchoir.org, based on the approved H9 design.
Hosted on GitHub Pages from the main branch, repository root.
Website: https://pandorasboxchoir.org/ (www redirects here).

This is a technical preview. Search indexing is disabled in the HTML until
the remaining copy, programme dates, and launch details have been reviewed.

The separate design workspace generates this folder with
`python tools/build_h9_from_h7.py` followed by `python tools/build_site.py`.
The link-preview image comes from `python tools/build_share_card.py`.
The ticket-page template is `tools/templates/tickets.html` in that workspace.
It uses the Pandora’s Box Ludus embed, limited to events. Sales and payment
authorization are managed in Ludus; the widget requires domain authorization.
The purchased Korinna webfont files and artwork retain their original rights;
this repository does not grant a separate licence to reuse them.
