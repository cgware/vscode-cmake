add_library(lib lib.c)

add_executable(lib_test test.c)
set_target_properties(lib_test PROPERTIES
	RUNTIME_OUTPUT_DIRECTORY_DEBUG ${CMAKE_SOURCE_DIR}/bin/main/Debug/
	RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_SOURCE_DIR}/bin/main/Release/
)
add_test(lib_build "${CMAKE_COMMAND}" --build ${CMAKE_BINARY_DIR} --config ${CMAKE_BUILD_TYPE} --target lib_test)
add_test(lib ${CMAKE_SOURCE_DIR}/bin/main/${CMAKE_BUILD_TYPE}/lib_test)
set_tests_properties(lib PROPERTIES DEPENDS lib_build)
