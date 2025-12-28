package main

import (
	"fmt"
	"os"
	"path"
	"path/filepath"

	"github.com/evan-buss/openbooks/server"
	"github.com/evan-buss/openbooks/util"

	"github.com/spf13/cobra"
)

var openBrowser = false
var serverConfig server.Config

func init() {
	desktopCmd.AddCommand(serverCmd)

	serverCmd.Flags().StringVarP(&serverConfig.Port, "port", "p", "5228", "Set the local network port for browser mode.")
	serverCmd.Flags().IntP("rate-limit", "r", 10, "The number of seconds to wait between searches to reduce strain on IRC search servers. Minimum is 10 seconds.")
	serverCmd.Flags().BoolVar(&serverConfig.DisableBrowserDownloads, "no-browser-downloads", false, "The browser won't recieve and download eBook files, but they are still saved to the defined 'dir' path.")
	serverCmd.Flags().StringVar(&serverConfig.Basepath, "basepath", "/", `Base path where the application is accessible. For example "/openbooks/".`)
	serverCmd.Flags().BoolVarP(&openBrowser, "browser", "b", false, "Open the browser on server start.")
	serverCmd.Flags().BoolVar(&serverConfig.Persist, "persist", false, "Persist eBooks in 'dir'. Default is to delete after sending.")
	serverCmd.Flags().StringVarP(&serverConfig.DownloadDir, "dir", "d", filepath.Join(os.TempDir(), "openbooks"), "The directory where eBooks are saved when persist enabled.")
	serverCmd.Flags().BoolVar(&serverConfig.AutoExtractAll, "auto-extract", false, "Automatically extract all files from downloaded archives (zips, rars, etc.) and remove the archive.")
}

var serverCmd = &cobra.Command{
	Use:   "server",
	Short: "Run OpenBooks in server mode.",
	Long:  "Run OpenBooks in server mode. This allows you to use a web interface to search and download eBooks.",
	PreRunE: func(cmd *cobra.Command, args []string) error {
		// Allow execution if either --name is provided or --random-name is set
		if globalFlags.UserName == "" && !globalFlags.RandomUsername {
			return fmt.Errorf("either --name or --random-name flag is required")
		}
		bindGlobalServerFlags(&serverConfig)
		rateLimit, _ := cmd.Flags().GetInt("rate-limit")
		ensureValidRate(rateLimit, &serverConfig)
		// If cli flag isn't set (default value) check for the presence of an
		// environment variable and use it if found.
		if serverConfig.Basepath == cmd.Flag("basepath").DefValue {
			if envPath, present := os.LookupEnv("BASE_PATH"); present {
				serverConfig.Basepath = envPath
			}
		}
		serverConfig.Basepath = sanitizePath(serverConfig.Basepath)

		// Check for authentication environment variables if flags aren't set
		if serverConfig.AuthUser == "" {
			if envUser, present := os.LookupEnv("AUTH_USER"); present {
				serverConfig.AuthUser = envUser
			}
		}
		if serverConfig.AuthPass == "" {
			if envPass, present := os.LookupEnv("AUTH_PASS"); present {
				serverConfig.AuthPass = envPass
			}
		}

		// Log authentication status
		if serverConfig.AuthUser != "" && serverConfig.AuthPass != "" {
			fmt.Printf("HTTP Basic Authentication enabled for user: %s\n", serverConfig.AuthUser)
		}

		return nil
	},
	Run: func(cmd *cobra.Command, args []string) {
		if openBrowser {
			browserUrl := "http://127.0.0.1:" + path.Join(serverConfig.Port+serverConfig.Basepath)
			util.OpenBrowser(browserUrl)
		}

		server.Start(serverConfig)
	},
}
