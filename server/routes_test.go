package server

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDeleteBooksHandlerPreventsTraversal(t *testing.T) {
	baseDir := t.TempDir()
	booksDir := filepath.Join(baseDir, "books")
	if err := os.MkdirAll(booksDir, 0o755); err != nil {
		t.Fatalf("mkdir books: %v", err)
	}

	outside := filepath.Join(baseDir, "outside.txt")
	if err := os.WriteFile(outside, []byte("secret"), 0o644); err != nil {
		t.Fatalf("write outside file: %v", err)
	}

	s := New(Config{DownloadDir: baseDir, Persist: true, Basepath: "/"})
	router := s.registerRoutes()

	req := httptest.NewRequest(http.MethodDelete, "/library/%2e%2e%2foutside.txt", nil)
	req.AddCookie(&http.Cookie{Name: "OpenBooks", Value: "70fbe39a-3096-4a84-84c3-e4316ea407c8"})
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}

	if _, err := os.Stat(outside); err != nil {
		t.Fatalf("outside file should not be removed: %v", err)
	}
}

func TestGetBookHandlerEscapesContentDisposition(t *testing.T) {
	baseDir := t.TempDir()
	booksDir := filepath.Join(baseDir, "books")
	if err := os.MkdirAll(booksDir, 0o755); err != nil {
		t.Fatalf("mkdir books: %v", err)
	}

	fileName := "evil\"name.epub"
	bookPath := filepath.Join(booksDir, fileName)
	if err := os.WriteFile(bookPath, []byte("content"), 0o644); err != nil {
		t.Fatalf("write book: %v", err)
	}

	s := New(Config{DownloadDir: baseDir, Persist: true, Basepath: "/"})
	router := s.registerRoutes()

	req := httptest.NewRequest(http.MethodGet, "/library/"+url.PathEscape(fileName), nil)
	req.AddCookie(&http.Cookie{Name: "OpenBooks", Value: "70fbe39a-3096-4a84-84c3-e4316ea407c8"})
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	disposition := rec.Header().Get("Content-Disposition")
	if !strings.Contains(disposition, "attachment;") {
		t.Fatalf("expected attachment content-disposition, got %q", disposition)
	}
	if strings.Contains(disposition, "\n") || strings.Contains(disposition, "\r") {
		t.Fatalf("expected no header injection vectors, got %q", disposition)
	}
}
