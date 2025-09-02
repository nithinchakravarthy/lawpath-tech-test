Technical Decisions for the Lawpath Smart Next-Step System
This document outlines the key architectural and technical decisions made in developing the recommendation system, detailing the rationale behind each choice.
1. Architectural Pattern: Event-Driven Microservices
Decision: The system is designed using a serverless, event-driven architecture, orchestrated by an SNS Topic.
Rationale:
Decoupling: By using SNS as a central message bus, the eventIngestion service is completely decoupled from the downstream workers. It doesn't need to know how the data is processed, only that it needs to be published. This makes the system highly extensible. We can add new workers (e.g., for analytics, fraud detection) without modifying the ingestion service.
Scalability: AWS Lambda functions are inherently scalable and can handle high request volumes without manual provisioning. The SNS fan-out pattern ensures that each worker can scale independently based on its specific workload.
Resilience: If one worker fails, the others are unaffected. Events are persisted by SNS until successfully delivered, preventing data loss.
2. Technology Choices
a. Infrastructure as Code (IaC) with Serverless Framework
Decision: serverless.yml is used to define and deploy all cloud resources.
Rationale: This choice provides a single source of truth for the entire system's infrastructure. It automates deployment, reduces configuration drift, and makes the system reproducible in different environments (e.g., development, staging, production).
b. Vector Database: Qdrant
Decision: Qdrant was selected as the vector database for storing and querying event embeddings.
Rationale:
Performance: Qdrant is a high-performance, open-source vector search engine. Its REST API is straightforward to integrate, and it is well-suited for similarity searches on a large scale.
Self-Hosting on LocalStack: It runs natively in a container, making it a perfect fit for a fully local development environment alongside LocalStack.
c. Database: DynamoDB
Decision: DynamoDB is used for two purposes: storing historical events and caching recommendation results.
Rationale:
Events Table: The key-value nature and schema-less design of DynamoDB are ideal for storing unstructured event data at scale. The userId GSI (Global Secondary Index) is crucial for efficiently retrieving a user's event history to generate a "seed" for recommendations.
Cache Table: Its low-latency read performance makes it an excellent choice for a recommendation cache. A Time-to-Live (TTL) attribute is used to automatically expire stale cache entries, reducing manual management.
d. Local Development: LocalStack
Decision: LocalStack is used to run all AWS services locally in a container.
Rationale: This provides a realistic, isolated, and fast development environment. It eliminates the need for a live AWS account during development, accelerating the feedback loop and reducing costs.
3. Trade-offs and Future Considerations
Single-File Functions: The current implementation uses single, large Lambda functions. While this is acceptable for a tech test, a production system would benefit from breaking down complex logic into smaller, more focused modules to improve maintainability and testability.
Vector Generation: The current mock recommendation.js uses a simple embedding function for the test. In a production environment, this would be replaced with a robust ML model (e.g., from an NLP library or a hosted service like AWS SageMaker) to generate higher-quality, more meaningful vectors.
Scalability of Data Loading: The provided load-sample.sh script is suitable for the test but would not be efficient for 10M events. A production-ready solution would use a more scalable ingestion mechanism, such as S3 Batch Operations or a Kinesis stream, to process large datasets.
Cost Optimization: The current setup uses PAY_PER_REQUEST for DynamoDB, which is cost-effective for an unpredictable workload. In production, we would monitor traffic patterns to see if a provisioned throughput model would be more cost-effective.

