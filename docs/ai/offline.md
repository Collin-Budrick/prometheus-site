# Offline caching and storage notes

The AI island keeps on-device models cached so reloads work offline and avoid re-downloading multi-gigabyte weights. WebLLM stores model artifacts in IndexedDB under the `webllm/model` database, and Transformers.js keeps its files in either IndexedDB or the `transformers-cache` entry in Cache Storage. The UI surfaces an “Cached / offline ready” badge when either cache is detected before a download starts.

The storage checker uses `navigator.storage.estimate()` to compare free space against the selected model’s approximate size. If free space drops below the target size, the island shows a warning so users can switch to a smaller model or clear space before downloads fail.

## Clearing cached models

1. Open browser devtools → **Application/Storage**.
2. Remove the IndexedDB databases named `webllm/model` and anything containing `transformers`/`huggingface`.
3. Clear the `transformers-cache` entry under **Cache Storage** if present.
4. Reload the page and re-trigger a load to fetch fresh weights.
