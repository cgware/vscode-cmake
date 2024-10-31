#include <stdio.h>
#include <unistd.h>

int main() {
	for(int i = 0; i < 2; i++) {
		printf("Exe %d\n", i);
		sleep(1);
	}
	return 0;
}
