SHELL = bash

bytes-%:
	for i in {1..$*}; do cat kibibyte.txt; done; exit 1
.PHONY: bytes-%

lines-%:
	for i in {1..$*}; do echo a; done; exit 1
.PHONY: lines-%