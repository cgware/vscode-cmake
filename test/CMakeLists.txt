cmake_minimum_required(VERSION 3.10)

project(cmake_test LANGUAGES C)

enable_testing()

add_executable(main main.c)
set_target_properties(main
	PROPERTIES
	ARCHIVE_OUTPUT_DIRECTORY_DEBUG ${CMAKE_SOURCE_DIR}/bin/main/debug/
	LIBRARY_OUTPUT_DIRECTORY_DEBUG ${CMAKE_SOURCE_DIR}/bin/main/debug/
	RUNTIME_OUTPUT_DIRECTORY_DEBUG ${CMAKE_SOURCE_DIR}/bin/main/debug/
	ARCHIVE_OUTPUT_DIRECTORY_RELEASE ${CMAKE_SOURCE_DIR}/bin/main/release/
	LIBRARY_OUTPUT_DIRECTORY_RELEASE ${CMAKE_SOURCE_DIR}/bin/main/release/
	RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_SOURCE_DIR}/bin/main/release/
	OUTPUT_NAME cmain
	PREFIX ""
)

if(CMAKE_BUILD_TYPE STREQUAL "Debug")
	target_compile_options(main PRIVATE -O0 -ggdb)
endif()

add_executable(main_test test.c)
add_test(main_build "${CMAKE_COMMAND}" --build ${CMAKE_BINARY_DIR} --target main_test)
add_test(main main_test)
set_tests_properties(main PROPERTIES DEPENDS main_build)

add_subdirectory(exes)
add_subdirectory(libs)
