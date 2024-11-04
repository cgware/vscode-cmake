add_library(lib lib.c)

add_executable(lib_test test.c)
add_test(lib_build "${CMAKE_COMMAND}" --build ${CMAKE_BINARY_DIR} --target lib_test)
add_test(lib lib_test)
set_tests_properties(lib PROPERTIES DEPENDS lib_build)
