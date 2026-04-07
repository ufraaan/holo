package server

import (
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"time"
)

type logFields map[string]any

func logLine(level, msg string, fields logFields) {
	ts := time.Now().UTC().Format(time.RFC3339)
	builder := strings.Builder{}
	builder.WriteString(ts)
	builder.WriteString(" ")
	builder.WriteString(strings.ToUpper(level))
	builder.WriteString(" ")
	builder.WriteString(msg)

	if len(fields) > 0 {
		keys := make([]string, 0, len(fields))
		for k := range fields {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			builder.WriteString(" ")
			builder.WriteString(k)
			builder.WriteString("=")
			builder.WriteString(formatFieldValue(fields[k]))
		}
	}
	log.Print(builder.String())
}

func formatFieldValue(v any) string {
	switch x := v.(type) {
	case string:
		return strconv.Quote(x)
	case time.Time:
		return strconv.Quote(x.UTC().Format(time.RFC3339))
	case error:
		return strconv.Quote(x.Error())
	default:
		return fmt.Sprintf("%v", x)
	}
}

func logInfo(msg string, fields logFields) {
	logLine("info", msg, fields)
}

func logError(msg string, fields logFields) {
	logLine("error", msg, fields)
}
