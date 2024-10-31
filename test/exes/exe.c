#include <stdio.h>
#if defined(WIN32) || defined(_WIN32)
#include <Windows.h>
#else
#include <unistd.h>
#endif

int main() {
	for(int i = 0; i < 2; i++) {
		printf("Exe %d\n", i);
#if defined(WIN32) || defined(_WIN32)
		Sleep(1000);
#else
		sleep(1);
#endif
	}
	return 0;
}
