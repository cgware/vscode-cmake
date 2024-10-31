cmake_minimum_required(VERSION 3.10)

project(cmake_test LANGUAGES C)

add_executable(main main.c)
set_target_properties(main
	PROPERTIES
	ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/bin/main/
	LIBRARY_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/bin/main/
	RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/bin/main/
	OUTPUT_NAME cmain
	PREFIX ""
)

add_subdirectory(exes)
add_subdirectory(libs)
