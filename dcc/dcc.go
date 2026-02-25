package dcc

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"regexp"
	"strconv"
	"time"
)

// There are two types of DCC strings this program accepts.
// Download contains all of the necessary DCC info parsed from the DCC SEND string

var (
	ErrInvalidDCCString = errors.New("invalid dcc send string")
	ErrInvalidIP        = errors.New("unable to convert int IP to string")
	ErrMissingBytes     = errors.New("download size didn't match dcc file size. data could be missing")
)

const (
	dialTimeout = 20 * time.Second
	readTimeout = 45 * time.Second
)

var dccRegex = regexp.MustCompile(`DCC SEND "?(.+[^"])"?\s(\d+)\s+(\d+)\s+(\d+)\s*`)

type Download struct {
	Filename string
	IP       string
	Port     string
	Size     int64
}

// ParseString parses the important data of a DCC SEND string
func ParseString(text string) (*Download, error) {
	groups := dccRegex.FindStringSubmatch(text)

	if len(groups) == 0 {
		return nil, ErrInvalidDCCString
	}

	ip, err := stringToIP(groups[2])
	if err != nil {
		return nil, err
	}

	size, err := strconv.ParseInt(groups[4], 10, 64)
	if err != nil {
		return nil, err
	}

	return &Download{
		Filename: groups[1],
		IP:       ip,
		Port:     groups[3],
		Size:     size,
	}, nil
}

// Download writes the data contained in the DCC Download.
func (download Download) Download(ctx context.Context, writer io.Writer) error {
	if ctx == nil {
		ctx = context.Background()
	}

	dialer := &net.Dialer{Timeout: dialTimeout, KeepAlive: 30 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", download.IP+":"+download.Port)
	if err != nil {
		return err
	}
	defer conn.Close()

	// NOTE: Not using the idiomatic io.Copy or io.CopyBuffer because they are
	// much slower in real world tests than the manual way. I suspect it has to
	// do with the way the DCC server is sending data. I don't think it ever sends
	// an EOF like the io.* methods expect.

	// Benchmark: 2.36MB File
	// CopyBuffer - 4096 - 2m32s, 2m18s, 2m32s
	// Copy - 2m35s
	// Custom - 1024 - 35s
	// Custom - 4096 - 46s, 14s
	received := int64(0)
	bytes := make([]byte, 4096)
	for received < download.Size {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		if err := conn.SetReadDeadline(time.Now().Add(readTimeout)); err != nil {
			return err
		}

		n, readErr := conn.Read(bytes)

		// Write any data we received, even if there was also an error (e.g., io.EOF)
		if n > 0 {
			// Don't write more than the expected remaining bytes
			toWrite := int64(n)
			if received+toWrite > download.Size {
				toWrite = download.Size - received
			}
			_, writeErr := writer.Write(bytes[:toWrite])
			if writeErr != nil {
				return writeErr
			}
			received += toWrite
		}

		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				break // Connection closed, check if we got everything
			}

			var netErr net.Error
			if errors.As(readErr, &netErr) && netErr.Timeout() {
				return fmt.Errorf("dcc read timeout after %s", readTimeout)
			}

			return readErr
		}
	}

	if received != download.Size {
		return ErrMissingBytes
	}

	return nil
}

// Convert a given 32 bit IP integer to an IP string
// Ex) 2907707975 -> 192.168.1.1
func stringToIP(nn string) (string, error) {
	temp, err := strconv.ParseUint(nn, 10, 32)
	if err != nil {
		return "", ErrInvalidIP
	}
	intIP := uint32(temp)

	ip := make(net.IP, 4)
	binary.BigEndian.PutUint32(ip, intIP)
	return ip.String(), nil
}
