package util

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectArchiveSkipsValidEPUB(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "book.epub.temp")
	if err := os.WriteFile(path, buildEPUBLikeHeader(), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	newPath, isArchive := DetectArchive(path)
	if isArchive {
		t.Fatalf("expected valid epub to not be treated as archive")
	}
	if newPath != path {
		t.Fatalf("expected unchanged path, got %s", newPath)
	}
}

func TestDetectArchiveRenamesMisnamedZip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "book.epub.temp")
	if err := os.WriteFile(path, []byte("PK\x03\x04NOTEPUB"), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	newPath, isArchive := DetectArchive(path)
	if !isArchive {
		t.Fatalf("expected file to be treated as archive")
	}
	if filepath.Ext(newPath) != ".temp" || filepath.Ext(newPath[:len(newPath)-len(".temp")]) != ".zip" {
		t.Fatalf("expected renamed zip temp path, got %s", newPath)
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("renamed file missing: %v", err)
	}
}

func buildEPUBLikeHeader() []byte {
	// ZIP local header + filename "mimetype" + payload "application/epub+zip"
	header := make([]byte, 30+8+len("application/epub+zip"))
	header[0] = 0x50
	header[1] = 0x4B
	header[2] = 0x03
	header[3] = 0x04
	// filename length (little-endian): 8
	header[26] = 8
	header[27] = 0
	copy(header[30:], []byte("mimetype"))
	copy(header[38:], []byte("application/epub+zip"))
	return header
}
