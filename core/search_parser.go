package core

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
)

// List of file extensions that I've encountered.
// Some of them aren't eBooks, but they were returned
// in previous search results.
var fileTypes = [...]string{
	"epub",
	"mobi",
	"azw3",
	"html",
	"rtf",
	"pdf",
	"cdr",
	"lit",
	"cbr",
	"doc",
	"htm",
	"jpg",
	"txt",
	"rar", // Compressed extensions should always be last 2 items
	"zip",
}

// BookDetail contains the details of a single Book found on the IRC server
type BookDetail struct {
	Server string `json:"server"`
	Author string `json:"author"`
	Title  string `json:"title"`
	Format string `json:"format"`
	Size   string `json:"size"`
	Full   string `json:"full"`
}

type ParseError struct {
	Line  string `json:"line"`
	Error error  `json:"error"`
}

func (p *ParseError) MarshalJSON() ([]byte, error) {
	item := struct {
		Line  string `json:"line"`
		Error string `json:"error"`
	}{
		Line:  p.Line,
		Error: p.Error.Error(),
	}
	return json.Marshal(item)
}

func (p ParseError) String() string {
	return fmt.Sprintf("Error: %s. Line: %s.", p.Error, p.Line)
}

// ParseSearchFile converts a single search file into an array of BookDetail
func ParseSearchFile(filePath string) ([]BookDetail, []ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	books, errs := ParseSearchV2(file)
	return books, errs, nil
}

func ParseSearch(reader io.Reader) ([]BookDetail, []ParseError) {
	return ParseSearchV2(reader)
}

// Parse line extracts data from a single line
func parseLine(line string) (BookDetail, error) {

	//First check if it follows the correct format. Some servers don't include file info...
	if !strings.Contains(line, "::INFO::") {
		return BookDetail{}, errors.New("invalid line format. ::INFO:: not found")
	}

	var book BookDetail
	book.Full = line[:strings.Index(line, " ::INFO:: ")]
	var tmp int

	// Get Server
	if tmp = strings.Index(line, " "); tmp == -1 {
		return BookDetail{}, errors.New("could not parse server")
	}
	book.Server = line[1:tmp] // Skip the "!"
	line = line[tmp+1:]

	// Get the Author
	if tmp = strings.Index(line, " - "); tmp == -1 {
		return BookDetail{}, errors.New("could not parse author")
	}
	book.Author = line[:tmp]
	line = line[tmp+len(" - "):]

	// Get the Title
	for _, ext := range fileTypes { //Loop through each possible file extension we've got on record
		tmp = strings.Index(line, "."+ext) // check if it contains our extension
		if tmp == -1 {
			continue
		}
		book.Format = ext
		if ext == "rar" || ext == "zip" { // If the extension is .rar or .zip the actual format is contained in ()
			for _, ext2 := range fileTypes[:len(fileTypes)-2] { // Range over the eBook formats (exclude archives)
				if strings.Contains(line[:tmp], ext2) {
					book.Format = ext2
				}
			}
		}
		book.Title = line[:tmp]
		line = line[tmp+len(ext)+1:]
	}

	if book.Title == "" { // Got through the entire loop without finding a single match
		return BookDetail{}, errors.New("could not parse title")
	}

	// Get the Size
	if tmp = strings.Index(line, "::INFO:: "); tmp == -1 {
		return BookDetail{}, errors.New("could not parse size")
	}

	line = strings.TrimSpace(line)
	splits := strings.Split(line, " ")

	if len(splits) >= 2 {
		book.Size = splits[1]
	}

	return book, nil
}

func ParseSearchV2(reader io.Reader) ([]BookDetail, []ParseError) {
	books := make([]BookDetail, 0)
	parseErrors := make([]ParseError, 0)

	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "!") {
			dat, err := parseLineV2(line)
			if err != nil {
				parseErrors = append(parseErrors, ParseError{Line: line, Error: err})
			} else {
				books = append(books, dat)
			}
		}
	}

	sort.Slice(books, func(i, j int) bool { return books[i].Server < books[j].Server })

	return books, parseErrors
}

func parseLineV2(line string) (BookDetail, error) {
	line = strings.TrimSpace(line)
	if line == "" || line[0] != '!' {
		return BookDetail{}, errors.New("result lines must start with '!'")
	}

	fullLine := line
	size := "N/A"
	if infoIndex := strings.Index(line, " ::INFO:: "); infoIndex != -1 {
		fullLine = strings.TrimSpace(line[:infoIndex])
		sizeBits := strings.Fields(strings.TrimSpace(line[infoIndex+len(" ::INFO:: "):]))
		if len(sizeBits) > 0 {
			size = sizeBits[0]
			if len(sizeBits) > 1 {
				unit := strings.TrimSpace(sizeBits[1])
				if len(unit) <= 3 {
					size += unit
				}
			}
		}
	}

	firstSpace := strings.Index(fullLine, " ")
	if firstSpace == -1 {
		return BookDetail{}, errors.New("unable parse server name")
	}
	server := fullLine[1:firstSpace]
	rest := strings.TrimSpace(fullLine[firstSpace+1:])
	if rest == "" {
		return BookDetail{}, errors.New("unable to parse title")
	}

	titlePlusMeta, format, err := splitTitleAndFormat(rest)
	if err != nil {
		return BookDetail{}, err
	}

	author, title := splitAuthorAndTitle(titlePlusMeta)
	if title == "" {
		return BookDetail{}, errors.New("unable to parse title")
	}

	return BookDetail{
		Server: server,
		Author: author,
		Title:  title,
		Format: format,
		Size:   size,
		Full:   fullLine,
	}, nil
}

func splitTitleAndFormat(input string) (string, string, error) {
	lower := strings.ToLower(input)
	bestExt := ""
	bestIndex := -1
	for _, ext := range fileTypes {
		idx := strings.LastIndex(lower, "."+ext)
		if idx > bestIndex {
			bestIndex = idx
			bestExt = ext
		}
	}

	if bestIndex == -1 {
		return "", "", errors.New("unable to parse title")
	}

	title := strings.TrimSpace(input[:bestIndex])
	if title == "" {
		return "", "", errors.New("unable to parse title")
	}

	format := bestExt
	if bestExt == "rar" || bestExt == "zip" {
		lowerTitle := strings.ToLower(title)
		for _, ext := range fileTypes[:len(fileTypes)-2] {
			if strings.Contains(lowerTitle, "("+ext+")") ||
				strings.Contains(lowerTitle, "["+ext+"]") ||
				strings.Contains(lowerTitle, "."+ext) {
				format = ext
				break
			}
		}
	}

	return title, format, nil
}

func splitAuthorAndTitle(input string) (string, string) {
	working := strings.TrimSpace(input)
	if strings.HasPrefix(working, "%") {
		if idx := strings.Index(working[1:], "%"); idx != -1 {
			working = strings.TrimSpace(working[idx+2:])
		}
	}

	delimiter := " - "
	firstDash := strings.Index(working, delimiter)
	if firstDash == -1 {
		return "Unknown", strings.TrimSpace(working)
	}

	author := strings.TrimSpace(working[:firstDash])
	title := strings.TrimSpace(working[firstDash+len(delimiter):])

	// Handle "hash - author - title" patterns where the first token is a non-human ID.
	if !strings.Contains(author, " ") {
		if secondDash := strings.Index(title, delimiter); secondDash != -1 {
			author = strings.TrimSpace(title[:secondDash])
			title = strings.TrimSpace(title[secondDash+len(delimiter):])
		}
	}

	if author == "" {
		author = "Unknown"
	}

	return author, title
}
