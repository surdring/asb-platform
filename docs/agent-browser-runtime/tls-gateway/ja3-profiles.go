// tls-gateway/ja3-profiles.go
package main

type JA3Profile struct {
	Name        string
	Description string
}

type JA3ProfileLibrary struct {
	profiles map[string]*JA3Profile
}

func NewJA3ProfileLibrary() *JA3ProfileLibrary {
	lib := &JA3ProfileLibrary{profiles: make(map[string]*JA3Profile)}
	lib.registerProfile(&JA3Profile{Name: "Chrome-110-Linux", Description: "Chrome 110 on Linux"})
	lib.registerProfile(&JA3Profile{Name: "Chrome-115-Linux", Description: "Chrome 115 on Linux"})
	lib.registerProfile(&JA3Profile{Name: "Chrome-124-macOS", Description: "Chrome 124 on macOS"})
	lib.registerProfile(&JA3Profile{Name: "Chrome-125-Windows10", Description: "Chrome 125 on Windows 10"})
	lib.registerProfile(&JA3Profile{Name: "Safari-18-macOS", Description: "Safari 18 on macOS"})
	lib.registerProfile(&JA3Profile{Name: "Edge-Windows10", Description: "Edge on Windows 10"})
	lib.registerProfile(&JA3Profile{Name: "Firefox-Linux", Description: "Firefox on Linux"})
	lib.registerProfile(&JA3Profile{Name: "random", Description: "Random profile selection"})
	return lib
}

func (lib *JA3ProfileLibrary) registerProfile(profile *JA3Profile) {
	lib.profiles[profile.Name] = profile
}

func (lib *JA3ProfileLibrary) GetProfile(name string) *JA3Profile {
	if profile, exists := lib.profiles[name]; exists {
		return profile
	}
	return lib.profiles["Chrome-124-macOS"]
}

func (lib *JA3ProfileLibrary) ListProfiles() []string {
	names := make([]string, 0, len(lib.profiles))
	for name := range lib.profiles {
		names = append(names, name)
	}
	return names
}
