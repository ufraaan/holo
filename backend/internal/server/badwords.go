// Warning: this file contains profanity. The list below is necessary for the
// profanity filter to work. Stop reading here if you'd rather not see it.

package server

import (
	"strings"
	"unicode"
)

var profanityList = []string{
	"4r5e", "5h1t", "5hit", "a55", "anal", "anus", "ar5e", "arrse", "arse", "arsehole", "arses",
	"ass", "ass-fucker", "asses", "assfucker", "assfukka", "asshat", "asshole", "assholes",
	"asswhole", "a_s_s", "a$$", "as$", "a$s", "b!tch", "b00bs", "b17ch", "b1tch",
	"bakchod", "balatkar", "ballbag", "balls", "ballsack", "bastard", "beastial", "beastiality", "behanchod",
	"behenchod", "bellend", "betichod", "bevda", "bevakoof", "bhadva", "bhadve",
	"bhadwa", "bhenchod", "bhosada", "bhosda", "bhosdike",
	"bestial", "bestiality", "bi+ch", "biatch", "bitch", "bitchboy", "bitcher",
	"bitchers", "bitches", "bitchin", "bitching", "bloody", "blow job", "blowjob",
	"blowjobs", "boiolas", "bollock", "bollok", "boner", "boob", "boobs", "booobs",
	"boooobs", "booooobs", "booooooobs", "breasts", "buceta", "bugger", "bullshit",
	"bum", "butt", "butts", "butthole", "buttmuch", "buttplug", "c0ck",
	"c0cksucker", "carpet muncher", "cawk", "chakka", "chinaal", "chod", "chodu", "choot",
	"chootia", "chootiya", "chudai", "chudan", "chusna", "chut", "chutiya",
	"chutiye", "chink", "cipa", "cl1t", "clit",
	"clitoris", "clits", "cnut", "cock", "cock-sucker", "cockface", "cockhead",
	"cockmunch", "cockmuncher", "cocks", "cocksuck", "cocksucked", "cocksucker",
	"cocksucking", "cocksucks", "cocksuka", "cocksukka", "cok", "cokmuncher",
	"coksucka", "coon", "cox", "crap", "cum", "cummer", "cumming", "cums",
	"cumshot", "cunilingus", "cunillingus", "cunnilingus", "cunt", "cuntlick",
	"cuntlicker", "cuntlicking", "cunts", "cyalis", "cyberfuc", "cyberfuck",
	"cyberfucked", "cyberfucker", "cyberfuckers", "cyberfucking", "d1ck", "damn",
	"dick", "dumbass", "dickhead", "dildo", "dildos", "dink", "dinks", "dirsa", "dlck",
	"dog-fucker", "doggin", "dogging", "donkeyribber", "doosh", "duche", "dyke",
	"ejaculate", "ejaculated", "ejaculates", "ejaculating", "ejaculatings",
	"ejaculation", "ejakulate", "f u c k", "f u c k e r", "f4nny", "fag",
	"fagging", "faggitt", "faggot", "faggs", "fagot", "fagots", "fags", "fanny",
	"fannyflaps", "fannyfucker", "fanyy", "fatass", "fcuk", "fcuker", "fcuking",
	"feck", "fecker", "felching", "fellate", "fellatio", "fingerfuck",
	"fingerfucked", "fingerfucker", "fingerfuckers", "fingerfucking", "fingerfucks",
	"fistfuck", "fistfucked", "fistfucker", "fistfuckers", "fistfucking",
	"fistfuckings", "fistfucks", "flange", "fook", "fooker", "fuck", "fucka",
	"fucked", "fucker", "fuckers", "fuckhead", "fuckheads", "fuckin", "fucking",
	"fuckings", "fuckingshitmotherfucker", "fuckme", "fucks", "fucktard", "fuckwhit", "fuckwit",
	"fudge packer", "fudgepacker", "fuk", "fuker", "fukker", "fukkin", "fuks",
	"fukwhit", "fukwit", "fux", "fux0r", "f_u_c_k", "gaand", "gaandu", "gand", "gandu", "gangbang", "gangbanged",
	"gangbangs", "gaylord", "gaysex", "goatse", "god-dam", "god-damned", "goddamn",
	"goddamned", "hagna", "harami", "hardcoresex", "headass", "hijda", "hoar", "hoare", "hoer", "hoes", "homo",
	"hore", "horniest", "horny", "hotsex", "jack-off", "jackoff", "jap", "jerk-off",
	"jism", "jiz", "jizm", "jizz", "kamina", "kamine", "kuttiya", "kutta", "kutiya", "kawk", "knobead", "knobed", "knobend",
	"knobhead", "knobjocky", "knobjokey", "kock", "kondum", "kondums", "kum",
	"kummer", "kumming", "kums", "kunilingus", "l3i+ch", "l3itch", "labia", "lavda", "lavde", "lawde",
	"lauda", "laude", "loda", "lode", "lund", "lust", "lwde",
	"lusting", "m0f0", "m0fo", "maa ki chut", "madarchod", "maderchod", "m45terbate", "ma5terb8", "ma5terbate", "masochist",
	"master-bate", "masterb8", "masterbat*", "masterbat3", "masterbate",
	"masterbation", "masterbations", "masturbate", "mo-fo", "mof0", "mofo",
	"mothafuck", "mothafucka", "mothafuckas", "mothafuckaz", "mothafucked",
	"mothafucker", "mothafuckers", "mothafuckin", "mothafucking", "mothafuckings",
	"mothafucks", "motherfuck", "motherfucked", "motherfucker", "motherfuckers",
	"motherfuckin", "motherfucking", "motherfuckings", "motherfuckka", "motherfucks",
	"moot", "muff", "muth", "muthafecker", "muthafuckker", "mutherfucker", "n1gga", "n1gger", "najayaz", "nalli", "namard",
	"nazi", "nigg3r", "nigg4h", "nigga", "niggah", "niggas", "niggaz", "nigger",
	"niggers", "nob", "nob jokey", "nobhead", "nobjocky", "nobjokey", "numbnuts",
	"nutsack", "orgasim", "orgasims", "orgasm", "orgasms", "p0rn", "pawn", "pecker",
	"penis", "penisfucker", "phate", "phonesex", "phuck", "phuk", "phuked", "phuking",
	"phukked", "phukking", "phuks", "phuq", "pigfucker", "pimpis", "piss",
	"pissed", "pisser", "pissers", "pisses", "pissflaps", "pissin", "pissing",
	"pissoff", "poop", "porn", "porno", "pornography", "pornos", "prick", "pricks",
	"pron", "pube", "pusse", "pussi", "pussies", "pussy", "pussys", "raand", "randi", "rectum",
	"retard", "rimjaw", "rimming", "s hit", "s.o.b.", "sadist", "sala", "saala", "schlong",
	"screwing", "scroat", "scrote", "scrotum", "suar", "semen", "sex", "sh!+", "sh!t",
	"sh1t", "shag", "shagger", "shaggin", "shagging", "shemale", "shi+", "shit",
	"shitdick", "shite", "shited", "shitey", "shitfuck", "shitfull", "shithead",
	"shiting", "shitings", "shits", "shitted", "shitter", "shitters", "shitting",
	"shittings", "shitty", "skank", "slut", "sluts", "smegma", "smut", "snatch",
	"son-of-a-bitch", "spac", "spunk", "s_h_i_t", "t1tt1e5", "t1tties", "tatti", "teets",
	"teez", "testical", "testicle", "tit", "titfuck", "tits", "titt", "tittie5",
	"tittiefucker", "titties", "tittyfuck", "tittywank", "titwank", "tosser",
	"turd", "tw4t", "twat", "twathead", "twatty", "twunt", "twunter", "ullu", "v14gra",
	"v1gra", "vagina", "viagra", "vulva", "w00se", "wang", "wank", "wanker",
	"wanky", "whoar", "whore", "willies", "willy",
}

func containsProfanity(s string) bool {
	lower := strings.ToLower(s)
	for _, word := range profanityList {
		lowerWord := strings.ToLower(word)
		for i := 0; i <= len(lower)-len(lowerWord); i++ {
			if lower[i:i+len(lowerWord)] == lowerWord {
				beforeOk := i == 0 || !isAlphaNumeric(rune(lower[i-1]))
				afterOk := i+len(lowerWord) >= len(lower) || !isAlphaNumeric(rune(lower[i+len(lowerWord)]))
				if beforeOk && afterOk {
					return true
				}
			}
		}
	}
	return false
}

func isAlphaNumeric(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r)
}
