cd postman
set NODE_OPTIONS="--max_old_space_size=14336"
newman run 00_Flow.postman_collection.json -e environment/VisboReST.postman_environment.json
