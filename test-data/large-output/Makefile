SHELL = bash

# this tests fix for the following issues
# https://github.com/nick-fields/retry/issues/76
# https://github.com/nick-fields/retry/issues/84

bytes-%:
	for i in {1..$*}; do cat kibibyte.txt; done; exit 2
.PHONY: bytes-%

lines-%:
	for i in {1..$*}; do echo a; done; exit 2
.PHONY: lines-%
