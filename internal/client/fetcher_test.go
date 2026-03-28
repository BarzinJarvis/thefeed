package client

import "testing"

func TestSetActiveResolversAllowsEmpty(t *testing.T) {
	fetcher, err := NewFetcher("t.example.com", "test-passphrase", []string{"1.1.1.1:53", "8.8.8.8:53"})
	if err != nil {
		t.Fatalf("NewFetcher: %v", err)
	}
	fetcher.SetActiveResolvers(nil)
	if got := fetcher.Resolvers(); len(got) != 0 {
		t.Fatalf("len(Resolvers()) = %d, want 0", len(got))
	}
}

func TestSetActiveResolversReplacesPool(t *testing.T) {
	fetcher, err := NewFetcher("t.example.com", "test-passphrase", []string{"1.1.1.1:53", "8.8.8.8:53"})
	if err != nil {
		t.Fatalf("NewFetcher: %v", err)
	}
	fetcher.SetActiveResolvers([]string{"9.9.9.9:53"})
	got := fetcher.Resolvers()
	if len(got) != 1 || got[0] != "9.9.9.9:53" {
		t.Fatalf("Resolvers() = %v, want [9.9.9.9:53]", got)
	}
}
