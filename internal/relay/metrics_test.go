package relay

import (
	"testing"

	"github.com/looplj/axonhub/llm"
)

func TestRecordUsageRecordsCacheTokens(t *testing.T) {
	metrics := &RelayMetrics{}
	metrics.RecordUsage(&llm.Usage{
		PromptTokens:     120,
		CompletionTokens: 30,
		PromptTokensDetails: &llm.PromptTokensDetails{
			CachedTokens:      80,
			WriteCachedTokens: 20,
		},
	})

	if metrics.CacheReadTokens != 80 {
		t.Fatalf("CacheReadTokens = %d, want 80", metrics.CacheReadTokens)
	}
	if metrics.CacheWriteTokens != 20 {
		t.Fatalf("CacheWriteTokens = %d, want 20", metrics.CacheWriteTokens)
	}
	if got := nonCachedInputTokens(metrics.Stats.InputToken, metrics.CacheReadTokens, metrics.CacheWriteTokens); got != 20 {
		t.Fatalf("nonCachedInputTokens() = %d, want 20", got)
	}
	if !metrics.CacheReported {
		t.Fatal("CacheReported = false, want true")
	}

	metrics.RecordUsage(&llm.Usage{PromptTokens: 10, CompletionTokens: 2})
	if metrics.CacheReported || metrics.CacheReadTokens != 0 || metrics.CacheWriteTokens != 0 {
		t.Fatalf("cache metrics were not reset: reported=%t read=%d write=%d",
			metrics.CacheReported, metrics.CacheReadTokens, metrics.CacheWriteTokens)
	}
}

func TestNonCachedInputTokensFallsBackToTotalForInvalidUsage(t *testing.T) {
	if got := nonCachedInputTokens(10, 8, 8); got != 10 {
		t.Fatalf("nonCachedInputTokens() = %d, want 10", got)
	}
}
