cmake_minimum_required(VERSION 3.10)

project(cmake_test LANGUAGES C)

add_executable(main main.c)

add_subdirectory(exes)
add_subdirectory(libs)
