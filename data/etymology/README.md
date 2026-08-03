# Drop-in ancient character forms

Put per-character SVGs here, named exactly:

    <character>-oracle.svg    甲骨文  oracle bone,  ~1200 BCE
    <character>-bronze.svg    金文    bronze inscription
    <character>-seal.svg      篆書    small seal script

e.g. `山-oracle.svg`. Then run `python3 scripts/build_etymology.py`.

That is Wikimedia Commons' own file-naming convention, so the public-domain
tracings there can be copied in unchanged. They are not fetched automatically:
`upload.wikimedia.org` is blocked by this project's build-environment egress
policy, and the build does not route around it.

A drop-in always takes precedence over the seal font for the same era.
Anything not matching the pattern is ignored.
