export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}

export function safeFilename(title: string): string {
  return (title.trim() || 'score').replace(/[\\/:*?"<>|]/g, '_');
}
