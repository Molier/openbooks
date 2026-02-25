package main

import (
	"fmt"
	"math/rand"
	"path"
	"time"

	"github.com/evan-buss/openbooks/server"
)

// Update a server config struct from globalFlags
func bindGlobalServerFlags(config *server.Config) {
	config.UserAgent = globalFlags.UserAgent
	config.Log = globalFlags.Log
	config.Server = globalFlags.Server
	config.SearchBot = globalFlags.SearchBot
	config.EnableTLS = globalFlags.EnableTLS
	config.TLSSkipVerify = globalFlags.TLSSkipVerify
	config.RandomUsername = globalFlags.RandomUsername

	// Generate random username if flag is set and no username provided
	if globalFlags.RandomUsername || globalFlags.UserName == "" {
		config.UserName = generateRandomUsername()
	} else {
		config.UserName = globalFlags.UserName
	}

	// Set authentication credentials
	config.AuthUser = globalFlags.AuthUser
	config.AuthPass = globalFlags.AuthPass

	// Validate that both auth credentials are set or both are empty
	if (config.AuthUser != "" && config.AuthPass == "") || (config.AuthUser == "" && config.AuthPass != "") {
		fmt.Println("Warning: Both --auth-user and --auth-pass must be set together. Authentication will be disabled.")
		config.AuthUser = ""
		config.AuthPass = ""
	}
}

// Random words pool for username generation
var randomWords = []string{
	"azure", "crimson", "golden", "silver", "bronze",
	"swift", "brave", "silent", "mystic", "cosmic",
	"forest", "ocean", "desert", "mountain", "river",
	"thunder", "lightning", "storm", "breeze", "frost",
	"phoenix", "dragon", "falcon", "wolf", "tiger",
	"maple", "cedar", "willow", "birch", "pine",
	"coral", "pearl", "amber", "jade", "ruby",
	"knight", "ranger", "mage", "archer", "sage",
	"nebula", "quasar", "pulsar", "comet", "meteor",
	"prism", "crystal", "diamond", "sapphire", "emerald",
}

// generateRandomUsername creates a random username in the format "word_timestamp"
// Example: "cosmic_1702405821" or "phoenix_987654"
func generateRandomUsername() string {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	word := randomWords[rng.Intn(len(randomWords))]
	timestamp := time.Now().Unix() % 1000000
	return fmt.Sprintf("%s_%d", word, timestamp)
}

// Make sure the server config has a valid rate limit.
func ensureValidRate(rateLimit int, config *server.Config) {

	// If user enters a limit that's too low, set to default of 10 seconds.
	if rateLimit < 10 {
		rateLimit = 10
	}

	config.SearchTimeout = time.Duration(rateLimit) * time.Second
}

func sanitizePath(basepath string) string {
	cleaned := path.Clean(basepath)
	if cleaned == "/" {
		return cleaned
	}
	return cleaned + "/"
}
