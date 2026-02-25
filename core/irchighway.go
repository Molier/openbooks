package core

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/evan-buss/openbooks/irc"
)

// Specific irc.irchighway.net commands

// Join connects to the irc.irchighway.net server and joins the #ebooks channel
func Join(irc *irc.Conn, address string, enableTLS bool, tlsSkipVerify bool) error {
	err := irc.Connect(address, enableTLS, tlsSkipVerify)
	if err != nil {
		return err
	}
	// Wait before joining the ebooks room
	// Often you recieve a private message from the server
	time.Sleep(time.Second * 2)
	return irc.JoinChannel("ebooks")
}

// SearchBook sends a search query to the search bot
func SearchBook(irc *irc.Conn, searchBot string, query string) error {
	searchBot = strings.TrimPrefix(searchBot, "@")
	searchBot = sanitizeIRCBoundInput(searchBot)
	query = sanitizeIRCBoundInput(query)
	if query == "" {
		return errors.New("search query cannot be empty")
	}
	if searchBot == "" {
		searchBot = "search"
	}

	return irc.SendMessage(fmt.Sprintf("@%s %s", searchBot, query))
}

// DownloadBook sends the book string to the download bot
func DownloadBook(irc *irc.Conn, book string) error {
	cleanBook := sanitizeIRCBoundInput(book)
	if cleanBook == "" {
		return errors.New("download request cannot be empty")
	}

	return irc.SendMessage(cleanBook)
}

// Send a CTCP Version response
func SendVersionInfo(irc *irc.Conn, line string, version string) error {
	// Line format is like ":messager PRIVMSG #channel: message"
	// we just want the messager without the colon
	fields := strings.Fields(line)
	if len(fields) == 0 || len(fields[0]) < 2 {
		return errors.New("unable to parse sender from irc line")
	}
	sender := sanitizeIRCBoundInput(fields[0][1:])
	if sender == "" {
		return errors.New("unable to parse sender from irc line")
	}

	// TODO: Figure out if there's an automated way to adjust this...
	return irc.SendNotice(sender, fmt.Sprintf("\x01%s\x01", sanitizeIRCBoundInput(version)))
}

func sanitizeIRCBoundInput(value string) string {
	withoutControls := strings.Map(func(r rune) rune {
		if r == '\r' || r == '\n' || r == 0 {
			return -1
		}
		return r
	}, value)
	return strings.TrimSpace(withoutControls)
}
