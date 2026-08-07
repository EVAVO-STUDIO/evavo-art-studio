#!/usr/bin/env bash
set -euo pipefail

ATTEMPTS="${CI_MEDIA_APT_ATTEMPTS:-2}"
UPDATE_TIMEOUT_SECONDS="${CI_MEDIA_APT_UPDATE_TIMEOUT_SECONDS:-120}"
INSTALL_TIMEOUT_SECONDS="${CI_MEDIA_APT_INSTALL_TIMEOUT_SECONDS:-180}"
RETRY_DELAY_SECONDS="${CI_MEDIA_RETRY_DELAY_SECONDS:-5}"
APT_GET_BIN="${CI_MEDIA_APT_GET_BIN:-$(command -v apt-get || true)}"
SUDO_BIN="${CI_MEDIA_SUDO_BIN:-$(command -v sudo || true)}"
TIMEOUT_BIN="${CI_MEDIA_TIMEOUT_BIN:-$(command -v timeout || true)}"
ENV_FILE="${CI_MEDIA_ENV_FILE:-${GITHUB_ENV:-}}"

fail() {
  printf 'Media tool bootstrap failed: %s\n' "$*" >&2
  exit 1
}

positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]] || fail "$2 must be a positive integer."
}

non_negative_integer() {
  [[ "$1" =~ ^[0-9]+$ ]] || fail "$2 must be a non-negative integer."
}

positive_integer "${ATTEMPTS}" "CI_MEDIA_APT_ATTEMPTS"
positive_integer "${UPDATE_TIMEOUT_SECONDS}" "CI_MEDIA_APT_UPDATE_TIMEOUT_SECONDS"
positive_integer "${INSTALL_TIMEOUT_SECONDS}" "CI_MEDIA_APT_INSTALL_TIMEOUT_SECONDS"
non_negative_integer "${RETRY_DELAY_SECONDS}" "CI_MEDIA_RETRY_DELAY_SECONDS"

resolve_media_path() {
  local configured="$1"
  local command_name="$2"
  if [[ -n "${configured}" ]]; then
    printf '%s\n' "${configured}"
    return 0
  fi
  command -v "${command_name}" 2>/dev/null || true
}

FFMPEG_PATH="$(resolve_media_path "${CI_MEDIA_FFMPEG_BIN:-}" ffmpeg)"
FFPROBE_PATH="$(resolve_media_path "${CI_MEDIA_FFPROBE_BIN:-}" ffprobe)"

media_tools_ready() {
  [[ -n "${FFMPEG_PATH}" && -x "${FFMPEG_PATH}" ]] &&
    [[ -n "${FFPROBE_PATH}" && -x "${FFPROBE_PATH}" ]]
}

install_media_tools() {
  [[ "$(uname -s)" == "Linux" ]] || fail "automatic FFmpeg installation is supported only on Linux runners."
  [[ -n "${APT_GET_BIN}" && -x "${APT_GET_BIN}" ]] || fail "apt-get is unavailable."
  [[ -n "${SUDO_BIN}" && -x "${SUDO_BIN}" ]] || fail "sudo is unavailable."
  [[ -n "${TIMEOUT_BIN}" && -x "${TIMEOUT_BIN}" ]] || fail "timeout is unavailable."

  local attempt
  for ((attempt = 1; attempt <= ATTEMPTS; attempt += 1)); do
    printf 'Media tool bootstrap attempt %s/%s\n' "${attempt}" "${ATTEMPTS}"

    if "${SUDO_BIN}" -n env DEBIAN_FRONTEND=noninteractive \
      "${TIMEOUT_BIN}" --signal=TERM --kill-after=15s "${UPDATE_TIMEOUT_SECONDS}s" \
      "${APT_GET_BIN}" \
      -o Acquire::Retries=3 \
      -o Acquire::http::Timeout=30 \
      -o Acquire::https::Timeout=30 \
      update \
      && "${SUDO_BIN}" -n env DEBIAN_FRONTEND=noninteractive \
      "${TIMEOUT_BIN}" --signal=TERM --kill-after=15s "${INSTALL_TIMEOUT_SECONDS}s" \
      "${APT_GET_BIN}" \
      -o Acquire::Retries=3 \
      -o Acquire::http::Timeout=30 \
      -o Acquire::https::Timeout=30 \
      -o DPkg::Lock::Timeout=60 \
      install --yes --no-install-recommends ffmpeg; then
      return 0
    fi

    if ((attempt < ATTEMPTS && RETRY_DELAY_SECONDS > 0)); then
      sleep "${RETRY_DELAY_SECONDS}"
    fi
  done

  return 1
}

if ! media_tools_ready; then
  printf 'FFmpeg tools were not available on PATH; using bounded package installation.\n'
  install_media_tools || fail "FFmpeg installation exhausted ${ATTEMPTS} bounded attempts."
  FFMPEG_PATH="$(resolve_media_path "${CI_MEDIA_FFMPEG_BIN:-}" ffmpeg)"
  FFPROBE_PATH="$(resolve_media_path "${CI_MEDIA_FFPROBE_BIN:-}" ffprobe)"
else
  printf 'Using preinstalled FFmpeg tools; package installation was skipped.\n'
fi

media_tools_ready || fail "ffmpeg and ffprobe are not executable after bootstrap."

FFMPEG_VERSION="$(${FFMPEG_PATH} -version | sed -n '1p')"
FFPROBE_VERSION="$(${FFPROBE_PATH} -version | sed -n '1p')"
FFMPEG_SHA256="$(sha256sum "${FFMPEG_PATH}" | awk '{print $1}')"
FFPROBE_SHA256="$(sha256sum "${FFPROBE_PATH}" | awk '{print $1}')"

[[ -n "${FFMPEG_VERSION}" ]] || fail "ffmpeg did not report a version."
[[ -n "${FFPROBE_VERSION}" ]] || fail "ffprobe did not report a version."
[[ "${FFMPEG_SHA256}" =~ ^[0-9a-f]{64}$ ]] || fail "ffmpeg SHA-256 is invalid."
[[ "${FFPROBE_SHA256}" =~ ^[0-9a-f]{64}$ ]] || fail "ffprobe SHA-256 is invalid."

emit() {
  local key="$1"
  local value="$2"
  if [[ -n "${ENV_FILE}" ]]; then
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}"
  fi
}

emit FFMPEG_BIN "${FFMPEG_PATH}"
emit FFPROBE_BIN "${FFPROBE_PATH}"
emit ART_STUDIO_FFMPEG_VERSION "${FFMPEG_VERSION}"
emit ART_STUDIO_FFPROBE_VERSION "${FFPROBE_VERSION}"
emit ART_STUDIO_FFMPEG_SHA256 "${FFMPEG_SHA256}"
emit ART_STUDIO_FFPROBE_SHA256 "${FFPROBE_SHA256}"

printf 'Validated ffmpeg: %s\n' "${FFMPEG_VERSION}"
printf 'Validated ffprobe: %s\n' "${FFPROBE_VERSION}"
