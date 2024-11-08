cmake_minimum_required(VERSION 3.10)

project(cmake_test LANGUAGES C)

enable_testing()

if(ARCH STREQUAL "x64")
	if(NOT MSVC)
		set(CMAKE_C_FLAGS "-m64")
	endif()
elseif(ARCH STREQUAL "x86")
	if(NOT MSVC)
		set(CMAKE_C_FLAGS "-m32")
	endif()
endif()

add_executable(main main.c)
set_target_properties(main PROPERTIES
	RUNTIME_OUTPUT_DIRECTORY_DEBUG ${CMAKE_SOURCE_DIR}/bin/main/${ARCH}-Debug/
	RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_SOURCE_DIR}/bin/main/${ARCH}-Release/
	OUTPUT_NAME cmain
)

if(CMAKE_BUILD_TYPE STREQUAL "Debug")
	if(NOT MSVC)
		target_compile_options(main PRIVATE -O0 -ggdb)
	endif()
endif()

add_executable(main_test test.c)
set_target_properties(main_test PROPERTIES
	RUNTIME_OUTPUT_DIRECTORY_DEBUG ${CMAKE_SOURCE_DIR}/bin/main/${ARCH}-Debug/
	RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_SOURCE_DIR}/bin/main/${ARCH}-Release/
)
add_test(main_build "${CMAKE_COMMAND}" --build ${CMAKE_BINARY_DIR} --config ${CMAKE_BUILD_TYPE} --target main_test)
add_test(main ${CMAKE_SOURCE_DIR}/bin/main/${ARCH}-${CMAKE_BUILD_TYPE}/main_test)
set_tests_properties(main PROPERTIES DEPENDS main_build)

add_subdirectory(exes)
add_subdirectory(libs)
