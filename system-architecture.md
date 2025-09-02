Lawpath "Smart Next-Step" Recommendation System Architecture
This diagram illustrates the 5-step event-driven data flow for the recommendation system, from event ingestion to recommendation retrieval.
1. Event Ingestion
A user action (e.g., "document_created") triggers a request to the eventIngestion API endpoint. This endpoint is a Lambda function that receives the event payload.
2. Event Routing
The eventIngestion Lambda publishes the event payload to an SNS Topic. This action routes the single event to multiple downstream workers.
3. Asynchronous Processing (Fan-Out)
Three separate worker Lambda functions are subscribed to the SNS Topic. They process the event in parallel for different purposes:
dynamo-worker: Persists the raw event data to a DynamoDB table (EventsTable) for long-term storage and historical analysis.
s3-worker: Archives the event payload to an S3 bucket (EventsBucket) for durable, cost-effective storage.
vector-worker: Converts the event data into a vector embedding and upserts it as a point into the Qdrant vector database for semantic search.
4. Recommendation Request
A separate recommendation API endpoint is exposed for clients to request "smart next-step" recommendations. This Lambda function receives a userId and a seedEventId.
5. Recommendation Generation
The recommendation Lambda first checks a DynamoDB cache (RecsCacheTable) for a recent recommendation for that user to reduce latency and database load. If no recent recommendation is found, it:
Retrieves the latest event data for the given userId from DynamoDB.
Uses the vector from the latest event as a query against the Qdrant vector database.
Qdrant returns a list of similar events (recommendations) based on vector similarity.
The Lambda combines this with other business logic and returns the top recommendations to the client. The result is also cached in RecsCacheTable.
!

The entire system is built using the Serverless Framework and runs on AWS Lambda, with local development and testing facilitated by LocalStack to simulate AWS services. This architecture allows for scalable, event-driven processing and real-time recommendation generation based on user actions.