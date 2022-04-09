cd postman
export NODE_OPTIONS=--max_old_space_size=8192
newman run "00 Flow.postman_collection.json" -e "environment/VisboReST AWS Development.postman_environment.json"
