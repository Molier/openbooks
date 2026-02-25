package util

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/mholt/archiver/v3"
)

var (
	ErrNotFullyCopied = errors.New("didn't copy entire file from the archive")
)

func ExtractArchive(archivePath string) (string, error) {
	extractPath := resolveArchivePath(archivePath)
	wIface, err := archiver.ByExtension(extractPath)
	if err != nil {
		return "", err
	}
	w, ok := wIface.(archiver.Walker)
	if !ok {
		return "", fmt.Errorf("format specified by archive filename is not a walker format: %s (%T)", archivePath, wIface)
	}

	var newPath string
	err = w.Walk(archivePath, func(f archiver.File) error {
		if newPath != "" {
			err := os.Remove(newPath)
			if err != nil {
				return err
			}
			newPath = ""
			return archiver.ErrStopWalk
		}

		newPath = filepath.Join(filepath.Dir(archivePath), filepath.Base(f.Name())+".temp")

		out, err := os.Create(newPath)
		if err != nil {
			return err
		}

		copied, err := io.Copy(out, f)
		if err != nil {
			return err
		}
		if copied != f.Size() {
			return ErrNotFullyCopied
		}

		err = out.Close()
		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return "", err
	}

	if newPath != "" {
		err := os.Remove(archivePath)
		if err != nil {
			log.Println("remove error", err)
		}
		return newPath, nil
	} else {
		return archivePath, nil
	}
}

// ExtractAllFiles extracts all files from an archive to the same directory.
// Prioritizes returning ebook files (.epub, .mobi, .pdf, .azw3) over other formats.
func ExtractAllFiles(archivePath string) (string, error) {
	extractPath := resolveArchivePath(archivePath)
	wIface, err := archiver.ByExtension(extractPath)
	if err != nil {
		return "", err
	}
	w, ok := wIface.(archiver.Walker)
	if !ok {
		return "", fmt.Errorf("format specified by archive filename is not a walker format: %s (%T)", archivePath, wIface)
	}

	var firstPath string
	var bestPath string
	fileCount := 0

	err = w.Walk(archivePath, func(f archiver.File) error {
		if f.IsDir() {
			return nil
		}

		newPath := filepath.Join(filepath.Dir(archivePath), filepath.Base(f.Name())+".temp")

		out, err := os.Create(newPath)
		if err != nil {
			return err
		}

		copied, err := io.Copy(out, f)
		if err != nil {
			out.Close()
			return err
		}
		if copied != f.Size() {
			out.Close()
			return ErrNotFullyCopied
		}

		err = out.Close()
		if err != nil {
			return err
		}

		if firstPath == "" {
			firstPath = newPath
		}
		ext := strings.ToLower(filepath.Ext(f.Name()))
		if bestPath == "" && (ext == ".epub" || ext == ".mobi" || ext == ".pdf" || ext == ".azw3") {
			bestPath = newPath
		}
		fileCount++

		return nil
	})

	if err != nil {
		return "", err
	}

	if fileCount > 0 {
		err := os.Remove(archivePath)
		if err != nil {
			log.Println("remove error", err)
		}
		resultPath := firstPath
		if bestPath != "" {
			resultPath = bestPath
		}
		log.Printf("Extracted %d files from archive, returning: %s\n", fileCount, resultPath)
		return resultPath, nil
	}

	return archivePath, nil
}

// DetectArchive checks if a file is an archive that should be extracted.
// It checks both file extension AND magic bytes (for misnamed files from IRC).
// If the file is detected as an archive by magic bytes but has a wrong extension,
// it renames the file to have the correct extension and returns the new path.
// Returns (newPath, true) if archive, (originalPath, false) if not.
func DetectArchive(path string) (string, bool) {
	cleanPath := path
	if filepath.Ext(path) == ".temp" {
		cleanPath = path[:len(path)-len(".temp")]
	}

	// First check by file extension
	_, err := archiver.ByExtension(cleanPath)
	if err == nil {
		log.Printf("Archive detected (by extension) for %s\n", cleanPath)
		return path, true
	}

	// Extension didn't match - check magic bytes for misnamed archives
	detectedExt := detectArchiveByContent(path)
	if detectedExt != "" {
		// Rename the file so archiver can detect format
		newPath := renameForExtraction(path, detectedExt)
		log.Printf("Archive detected (by magic bytes: %s) for %s -> %s\n", detectedExt, cleanPath, newPath)
		return newPath, true
	}

	log.Printf("Not an archive: %s\n", cleanPath)
	return path, false
}

// detectArchiveByContent reads the first bytes of a file to determine if it's
// an archive. Valid EPUB files (ZIPs with mimetype entry) are NOT detected as
// archives since they should be served as-is.
func detectArchiveByContent(filePath string) string {
	f, err := os.Open(filePath)
	if err != nil {
		return ""
	}
	defer f.Close()

	header := make([]byte, 262)
	n, err := f.Read(header)
	if err != nil || n < 4 {
		return ""
	}

	// RAR: "Rar!"
	if header[0] == 0x52 && header[1] == 0x61 && header[2] == 0x72 && header[3] == 0x21 {
		return ".rar"
	}

	// 7z
	if n >= 6 && header[0] == 0x37 && header[1] == 0x7A && header[2] == 0xBC && header[3] == 0xAF && header[4] == 0x27 && header[5] == 0x1C {
		return ".7z"
	}

	// ZIP: "PK\x03\x04" - but check if it's actually a valid EPUB first
	if header[0] == 0x50 && header[1] == 0x4B && header[2] == 0x03 && header[3] == 0x04 {
		if isValidEPUB(header, n) {
			return "" // Valid EPUB, don't treat as archive
		}
		return ".zip" // ZIP wrapper, extract it
	}

	return ""
}

// isValidEPUB checks ZIP header bytes for EPUB mimetype entry.
func isValidEPUB(header []byte, n int) bool {
	if n < 38 {
		return false
	}
	// ZIP local file header: filename length at offset 26 (2 bytes LE)
	fnLen := int(binary.LittleEndian.Uint16(header[26:28]))
	if fnLen != 8 || n < 30+fnLen {
		return false
	}
	if string(header[30:30+fnLen]) != "mimetype" {
		return false
	}
	// Check content is "application/epub+zip"
	extraLen := int(binary.LittleEndian.Uint16(header[28:30]))
	contentStart := 30 + fnLen + extraLen
	epubMime := "application/epub+zip"
	if n >= contentStart+len(epubMime) {
		return string(header[contentStart:contentStart+len(epubMime)]) == epubMime
	}
	return false
}

// renameForExtraction renames a .temp file to include the correct archive extension.
func renameForExtraction(filePath string, ext string) string {
	if filepath.Ext(filePath) != ".temp" {
		return filePath
	}
	base := filePath[:len(filePath)-len(".temp")]
	newPath := base + ext + ".temp"
	err := os.Rename(filePath, newPath)
	if err != nil {
		log.Printf("Failed to rename %s to %s: %v\n", filePath, newPath, err)
		return filePath
	}
	log.Printf("Renamed misnamed archive: %s -> %s\n", filePath, newPath)
	return newPath
}

func resolveArchivePath(archivePath string) string {
	return archivePath[:len(archivePath)-len(".temp")]
}
