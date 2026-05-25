package server

import "testing"

func TestContainsProfanity_exactMatch(t *testing.T) {
	if !containsProfanity("fuck") {
		t.Fatal("expected 'fuck' to be profane")
	}
}

func TestContainsProfanity_caseInsensitive(t *testing.T) {
	if !containsProfanity("FUCK") {
		t.Fatal("expected 'FUCK' to be profane (case insensitive)")
	}
	if !containsProfanity("Fuck") {
		t.Fatal("expected 'Fuck' to be profane")
	}
}

func TestContainsProfanity_wordBoundary_start(t *testing.T) {
	if !containsProfanity("fuck this") {
		t.Fatal("expected 'fuck this' to be profane")
	}
}

func TestContainsProfanity_wordBoundary_end(t *testing.T) {
	if !containsProfanity("this fuck") {
		t.Fatal("expected 'this fuck' to be profane")
	}
}

func TestContainsProfanity_wordBoundary_middle(t *testing.T) {
	if !containsProfanity("this fucking mess") {
		t.Fatal("expected 'this fucking mess' to be profane ('fucking' is in list)")
	}
}

func TestContainsProfanity_substringNoMatch(t *testing.T) {
	if containsProfanity("assassin") {
		t.Fatal("expected 'assassin' NOT to be profane (contains 'ass' but not at word boundary)")
	}
}

func TestContainsProfanity_cleanWord(t *testing.T) {
	if containsProfanity("hello") {
		t.Fatal("expected 'hello' NOT to be profane")
	}
}

func TestContainsProfanity_emptyString(t *testing.T) {
	if containsProfanity("") {
		t.Fatal("expected empty string NOT to be profane")
	}
}

func TestContainsProfanity_numbersOnly(t *testing.T) {
	if containsProfanity("123456") {
		t.Fatal("expected '123456' NOT to be profane")
	}
}

func TestContainsProfanity_alphanumeric(t *testing.T) {
	if containsProfanity("abc123") {
		t.Fatal("expected 'abc123' NOT to be profane")
	}
}

func TestContainsProfanity_variation(t *testing.T) {
	if !containsProfanity("shit") {
		t.Fatal("expected 'shit' to be profane")
	}
}

func TestContainsProfanity_wordBoundaryWithPunctuation(t *testing.T) {
	if !containsProfanity("foo.fuck.bar") {
		t.Fatal("expected 'foo.fuck.bar' to be profane (dots are word boundaries)")
	}
}

func TestContainsProfanity_notPartOfOtherWord(t *testing.T) {
	if containsProfanity("class") {
		t.Fatal("expected 'class' NOT to be profane ('ass' inside but not at word boundary)")
	}
}

func TestContainsProfanity_mixedCasePartial(t *testing.T) {
	if containsProfanity("Xass") {
		t.Fatal("expected 'Xass' NOT to be profane ('ass' not at word boundary after 'X')")
	}
}
