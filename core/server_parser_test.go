package core

import (
	"reflect"
	"testing"
)

func TestCaseInsensitiveSort(t *testing.T) {
	cases := []struct {
		input string
		want  IrcServers
	}{
		{
			"+FWServer ~Oatmeal +LawdyServer +fwServer evan",
			IrcServers{
				ElevatedUsers: []string{"FWServer", "fwServer", "LawdyServer", "Oatmeal"},
				RegularUsers:  []string{"evan"},
			},
		},
		{"",
			IrcServers{
				ElevatedUsers: []string{},
				RegularUsers:  []string{},
			},
		},
	}

	for _, v := range cases {
		result := ParseServers(v.input)
		if !reflect.DeepEqual(result.ElevatedUsers, v.want.ElevatedUsers) {
			t.Errorf("got %#v, want %#v", result.ElevatedUsers, v.want.ElevatedUsers)
		}

		if !reflect.DeepEqual(result.RegularUsers, v.want.RegularUsers) {
			t.Errorf("got %#v, want %#v", result.RegularUsers, v.want.RegularUsers)
		}
	}
}

func TestParseServersFromRawUserListLines(t *testing.T) {
	input := `:irc.example.net 353 TestNick = #ebooks :@Search +BSK normalUser
:irc.example.net 353 TestNick = #ebooks :+BSK +AnotherBot
:irc.example.net 366 TestNick #ebooks :End of /NAMES list.`

	result := ParseServers(input)

	wantElevated := []string{"AnotherBot", "BSK", "Search"}
	wantRegular := []string{"normalUser"}

	if !reflect.DeepEqual(result.ElevatedUsers, wantElevated) {
		t.Errorf("got %#v, want %#v", result.ElevatedUsers, wantElevated)
	}

	if !reflect.DeepEqual(result.RegularUsers, wantRegular) {
		t.Errorf("got %#v, want %#v", result.RegularUsers, wantRegular)
	}
}
