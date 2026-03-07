

# Fix Document Extraction - DOCX & PDF

## Root Causes

1. **Stack overflow (line 75)**: `btoa(String.fromCharCode(...uint8Array.slice(0, 500000)))` spreads up to 500k arguments, exceeding the call stack limit. This unused variable crashes the function for larger files.

2. **DOCX extraction broken**: `extractTextFromDOCX` decodes compressed ZIP binary as UTF-8 text, then searches for `<w:t>` XML tags. Since DOCX content is compressed inside the ZIP, the XML is never visible in plain text. Result: only garbage metadata or empty string.

3. **PDF extraction weak**: Regex-based `Tj/TJ` extraction only works on uncompressed PDF streams. Most modern PDFs use compressed streams (FlateDecode), so no text is found.

## Solution

Rewrite `supabase/functions/extract-document/index.ts` with:

### DOCX: Use JSZip library
- Import `JSZip` from `https://esm.sh/jszip@3.10.1`
- Properly decompress the ZIP archive
- Read `word/document.xml` from the decompressed entries
- Parse `<w:t>` tags from the actual XML content
- Handle paragraph breaks (`<w:p>`) for proper formatting

### PDF: Use pdfjs-serverless
- Import from `https://esm.sh/pdfjs-serverless@0.6.0`
- Properly parse PDF structure and extract text from all pages
- Falls back to regex method if library fails

### Remove crash
- Delete the unused `base64Content` line that causes stack overflow

### Keep AI cleanup step
- After successful raw extraction, still send to Lovable AI Gateway for formatting cleanup

## File Changes

| File | Change |
|------|--------|
| `supabase/functions/extract-document/index.ts` | Complete rewrite of extraction logic using JSZip + pdfjs-serverless |

## Flow After Fix

```text
Upload DOCX → Edge Function downloads from Storage
  → JSZip.loadAsync(data) decompresses ZIP
  → Read word/document.xml as string
  → Parse <w:t> tags → raw Vietnamese text
  → AI Gateway cleans up formatting
  → Return clean text content
```

