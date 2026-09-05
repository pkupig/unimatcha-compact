#!/bin/zsh
# Typecheck the iOS app's Swift sources against the iPhoneSimulator SDK (no simulator runtime or Xcode project needed).
#   scripts/typecheck.sh                      -> full tree under apps/ios/Unimatcha
#   scripts/typecheck.sh --only Core App Views/Components   -> only the given dirs/files (relative to apps/ios/Unimatcha)
# Prints "error:" lines (deduplicated) and a final "swiftc-exit=<code>" line. Exit code = swiftc exit code.
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
APP="$(cd "$(dirname "$0")/../Unimatcha" && pwd)"
cd "$APP" || exit 2
SDK=$(xcrun -sdk iphonesimulator --show-sdk-path)
typeset -a FILES
if [[ "$1" == "--only" ]]; then
  shift
  for p in "$@"; do
    if [[ -d "$p" ]]; then FILES+=("${(f)$(find "$p" -name '*.swift' | sort)}")
    elif [[ -f "$p" ]]; then FILES+=("$p")
    else echo "warn: no such path $p" >&2; fi
  done
else
  FILES=("${(f)$(find . -name '*.swift' | sort)}")
fi
[[ ${#FILES} -eq 0 ]] && { echo "no swift files"; echo "swiftc-exit=2"; exit 2; }
OUT=$(xcrun -sdk iphonesimulator swiftc -typecheck -swift-version 5 -D DEBUG -target arm64-apple-ios16.0-simulator -sdk "$SDK" -parse-as-library "${FILES[@]}" 2>&1)
CODE=$?
print -r -- "$OUT" | grep -E "error:" | grep -vE '^\s*\|' | sort -u
print -r -- "$OUT" | grep -cE "error:" | { read n; echo "error-lines=$n"; }
echo "swiftc-exit=$CODE"
exit $CODE
