
PER_TICK=10
SIZE=1024
DURATION=5000

bench:
	node benchmark/pub --size $(SIZE) --per-tick $(PER_TICK) --duration $(DURATION) &
	sleep 3
	node benchmark/sub --size $(SIZE) --duration $(DURATION)
