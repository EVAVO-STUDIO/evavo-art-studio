from pathlib import Path

ROOT = Path.cwd()
WORKFLOW_PATH = ROOT / ".github/workflows/ci.yml"
PACKAGE_PATH = ROOT / "package.json"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
old_media_step = '''      - name: Install and identify audio media tools
        shell: bash
        run: |
          set -euo pipefail
          sudo apt-get update
          sudo apt-get install --yes --no-install-recommends ffmpeg
          FFMPEG_PATH="$(command -v ffmpeg)"
          FFPROBE_PATH="$(command -v ffprobe)"
          test -x "${FFMPEG_PATH}"
          test -x "${FFPROBE_PATH}"
          FFMPEG_VERSION="$(${FFMPEG_PATH} -version | head -n 1)"
          FFPROBE_VERSION="$(${FFPROBE_PATH} -version | head -n 1)"
          FFMPEG_SHA256="$(sha256sum "${FFMPEG_PATH}" | awk '{print $1}')"
          FFPROBE_SHA256="$(sha256sum "${FFPROBE_PATH}" | awk '{print $1}')"
          echo "FFMPEG_BIN=${FFMPEG_PATH}" >> "${GITHUB_ENV}"
          echo "FFPROBE_BIN=${FFPROBE_PATH}" >> "${GITHUB_ENV}"
          echo "ART_STUDIO_FFMPEG_VERSION=${FFMPEG_VERSION}" >> "${GITHUB_ENV}"
          echo "ART_STUDIO_FFPROBE_VERSION=${FFPROBE_VERSION}" >> "${GITHUB_ENV}"
          echo "ART_STUDIO_FFMPEG_SHA256=${FFMPEG_SHA256}" >> "${GITHUB_ENV}"
          echo "ART_STUDIO_FFPROBE_SHA256=${FFPROBE_SHA256}" >> "${GITHUB_ENV}"
'''
new_media_step = '''      - name: Install and identify audio media tools
        run: bash scripts/bootstrap-ci-media-tools.sh
'''
workflow = replace_once(
    workflow,
    old_media_step,
    new_media_step,
    "exact-main media bootstrap step",
)
WORKFLOW_PATH.write_text(workflow, encoding="utf-8")

package = PACKAGE_PATH.read_text(encoding="utf-8")
package = replace_once(
    package,
    '    "toolchain:test": "node scripts/test-repository-toolchain.mjs",\n',
    '    "toolchain:test": "node scripts/test-repository-toolchain.mjs",\n'
    '    "ci:media-tools:test": "node --test scripts/test-ci-media-tool-bootstrap.mjs",\n',
    "media bootstrap package script",
)
package = replace_once(
    package,
    '"check": "pnpm run toolchain:check:installed && pnpm run toolchain:test && ',
    '"check": "pnpm run toolchain:check:installed && pnpm run toolchain:test && pnpm run ci:media-tools:test && ',
    "complete validation integration",
)
PACKAGE_PATH.write_text(package, encoding="utf-8")
