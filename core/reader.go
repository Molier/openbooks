package core

import (
	"bufio"
	"context"
	"io"
	"strings"
	"time"

	"github.com/evan-buss/openbooks/irc"
)

type event int

const (
	noOp           = event(0)
	Message        = event(1)
	SearchResult   = event(2)
	BookResult     = event(3)
	NoResults      = event(4)
	BadServer      = event(5)
	SearchAccepted = event(6)
	MatchesFound   = event(7)
	ServerList     = event(8)
	Ping           = event(9)
	Version        = event(10)
	Pong           = event(11)
)

// Unique identifiers found in the message for various different events.
const (
	pingMessage            = "PING"
	sendMessage            = "DCC SEND"
	noticeMessage          = "NOTICE"
	noResults              = "Sorry"
	serverUnavailable      = "try another server"
	searchAccepted         = "has been accepted"
	searchResultIdentifier = "_results_for"
	numMatches             = "matches"
	beginUserList          = "353"
	endUserList            = "366"
	versionInquiry         = "\x01VERSION\x01"
)

type HandlerFunc func(text string)
type EventHandler map[event]HandlerFunc

func StartReader(ctx context.Context, irc *irc.Conn, handler EventHandler) error {
	conn, err := irc.RawConn()
	if err != nil {
		return err
	}

	var users strings.Builder
	scanner := bufio.NewScanner(conn)
	for {
		select {
		case <-ctx.Done():
			return nil
		default:
			// Reset read deadline so dead sockets fail fast and trigger reconnect.
			if err := irc.SetReadDeadline(time.Now().Add(2 * time.Minute)); err != nil {
				return err
			}
		}

		if !scanner.Scan() {
			if err := scanner.Err(); err != nil {
				return err
			}
			return io.EOF
		}

		select {
		case <-ctx.Done():
			return nil
		default:
			text := scanner.Text()

			// Send raw message if they want to recieve it (logging purposes)
			if invoke, ok := handler[Message]; ok {
				invoke(text)
			}

			event := noOp
			if strings.Contains(text, sendMessage) {
				if strings.Contains(text, searchResultIdentifier) {
					event = SearchResult
				} else {
					event = BookResult
				}
			} else if strings.Contains(text, noticeMessage) {
				if strings.Contains(text, noResults) {
					event = NoResults
				} else if strings.Contains(text, serverUnavailable) {
					event = BadServer
				} else if strings.Contains(text, searchAccepted) {
					event = SearchAccepted
				} else if strings.Contains(text, numMatches) {
					start := strings.LastIndex(text, "returned") + 9
					end := strings.LastIndex(text, "matches") - 1
					text = text[start:end]
					event = MatchesFound
				}
			} else if strings.Contains(text, beginUserList) {
				users.WriteString(text)
			} else if strings.Contains(text, endUserList) {
				event = ServerList
				text = users.String()
				users.Reset()
			} else if strings.Contains(text, pingMessage) {
				event = Ping
			} else if strings.Contains(text, "PONG") {
				event = Pong
			} else if strings.Contains(text, versionInquiry) {
				event = Version
			}

			if invoke, ok := handler[event]; ok {
				go invoke(text)
			}
		}
	}
}
