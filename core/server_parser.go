package core

import (
	"sort"
	"strings"
)

var prefixes = map[byte]struct{}{
	'~': {},
	'&': {},
	'@': {},
	'%': {},
	'+': {},
}

type IrcServers struct {
	ElevatedUsers []string `json:"elevatedUsers"`
	RegularUsers  []string `json:"regularUsers"`
}

// ParseServers parses the complete list of IRC users to get the elevated users which in
// this case are the download servers
func ParseServers(rawString string) IrcServers {
	servers := IrcServers{
		ElevatedUsers: make([]string, 0),
		RegularUsers:  make([]string, 0),
	}
	elevatedSet := map[string]struct{}{}
	regularSet := map[string]struct{}{}

	for _, token := range extractServerTokens(rawString) {
		name := strings.TrimSpace(strings.TrimPrefix(token, ":"))
		if len(name) < 2 {
			continue
		}

		if _, exists := prefixes[name[0]]; exists {
			clean := name[1:]
			if clean == "" {
				continue
			}
			if _, exists := elevatedSet[clean]; !exists {
				elevatedSet[clean] = struct{}{}
				servers.ElevatedUsers = append(servers.ElevatedUsers, clean)
			}
			continue
		}

		if _, exists := regularSet[name]; !exists {
			regularSet[name] = struct{}{}
			servers.RegularUsers = append(servers.RegularUsers, name)
		}
	}

	sort.Slice(servers.ElevatedUsers, ignoreCaseSort(servers.ElevatedUsers))
	sort.Slice(servers.RegularUsers, ignoreCaseSort(servers.RegularUsers))

	return servers
}

func extractServerTokens(rawString string) []string {
	trimmed := strings.TrimSpace(rawString)
	if trimmed == "" {
		return []string{}
	}

	lines := strings.Split(trimmed, "\n")
	tokens := make([]string, 0, len(lines)*8)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if strings.Contains(line, " 353 ") {
			idx := strings.Index(line, " :")
			if idx == -1 {
				continue
			}
			namesSection := strings.TrimSpace(line[idx+2:])
			tokens = append(tokens, strings.Fields(namesSection)...)
			continue
		}

		// Ignore IRC protocol metadata lines that are not user lists.
		if strings.HasPrefix(line, ":") {
			continue
		}

		tokens = append(tokens, strings.Fields(line)...)
	}

	return tokens
}

func ignoreCaseSort(items []string) func(i, j int) bool {
	return func(i, j int) bool {
		return strings.ToLower(items[i]) < strings.ToLower(items[j])
	}
}
