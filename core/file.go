package core

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/evan-buss/openbooks/dcc"
	"github.com/evan-buss/openbooks/util"
)

func DownloadExtractDCCString(baseDir, dccStr string, progress io.Writer) (string, error) {
	return DownloadExtractDCCStringWithOptions(baseDir, dccStr, progress, false)
}

func DownloadExtractDCCStringWithOptions(baseDir, dccStr string, progress io.Writer, extractAll bool) (string, error) {
	// Download the file and wait until it is completed
	download, err := dcc.ParseString(dccStr)
	if err != nil {
		return "", err
	}

	dccPath := filepath.Join(baseDir, download.Filename+".temp")
	file, err := os.Create(dccPath)
	if err != nil {
		return "", err
	}

	writer := io.Writer(file)
	if progress != nil {
		writer = io.MultiWriter(file, progress)
	}

	// Download DCC data to the file
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()
	err = download.Download(ctx, writer)
	if err != nil {
		file.Close()
		return "", err
	}
	file.Close()

	// DetectArchive checks both extension AND magic bytes.
	// If the file is a misnamed archive (e.g., RAR with .epub extension),
	// it renames the file to have the correct extension and returns the new path.
	archivePath, isArchive := util.DetectArchive(dccPath)
	if !isArchive {
		return renameTempFile(dccPath), nil
	}

	var extractedPath string
	if extractAll {
		extractedPath, err = util.ExtractAllFiles(archivePath)
	} else {
		extractedPath, err = util.ExtractArchive(archivePath)
	}
	if err != nil {
		return "", err
	}

	return renameTempFile(extractedPath), nil
}

func renameTempFile(filePath string) string {
	if filepath.Ext(filePath) == ".temp" {
		newPath := filePath[:len(filePath)-len(".temp")]
		os.Rename(filePath, newPath)
		return newPath
	}

	return filePath
}
