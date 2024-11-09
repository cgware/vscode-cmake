add_library(lib lib.c)
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
	target_compile_options(lib PRIVATE -coverage)
	target_link_options(lib PRIVATE -coverage)
endif()

add_executable(lib_test test.c)
set_target_properties(lib_test PROPERTIES
	RUNTIME_OUTPUT_DIRECTORY_DEBUG ${CMAKE_SOURCE_DIR}/bin/lib/${ARCH}-Debug/
	RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_SOURCE_DIR}/bin/lib/${ARCH}-Release/
)
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
	target_compile_options(lib_test PRIVATE -coverage)
	target_link_options(lib_test PRIVATE -coverage)
endif()
target_link_libraries(lib_test lib)
add_test(lib_build "${CMAKE_COMMAND}" --build ${CMAKE_BINARY_DIR} --config ${CMAKE_BUILD_TYPE} --target lib_test)
add_test(lib ${CMAKE_SOURCE_DIR}/bin/lib/${ARCH}-${CMAKE_BUILD_TYPE}/lib_test)
set_tests_properties(lib PROPERTIES DEPENDS lib_build)
