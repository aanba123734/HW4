# HW4
SupplyEase Organization Diagram

```mermaid
graph TD
    %% Style Definitions (Yellow Box = MVP, Green Box = Additional Features)
    classDef homepage fill:#7B7B7B,stroke-width:2px,color:#fff
    classDef greenBox fill:#009100,stroke-width:2px,color:#fff
    classDef yellowBox fill:#A6A600,stroke-width:2px,color:#fff
    classDef blueBox fill:#0072E3,stroke-width:2px,color:#fff

    B1["Create Purchase Request"]:::yellowBox
    B2["Create Purchase Order"]:::yellowBox
    B3["Create Material Code"]:::yellowBox
    B4["Create Expedite"]:::greenBox
    B5["Create Payment"]:::greenBox

    C1["PR - PO Status"]:::yellowBox
    C2["Delivery Status"]:::yellowBox
    C3["Payment Status"]:::greenBox
    C4["Real-Time Statistics"]:::greenBox

    D1["Sourcing Project"]:::yellowBox

    E1["Supplier Information"]:::yellowBox
    E2["Supplier Request / Registration"]:::yellowBox
    E3["Supplier Ranking / Grouping"]:::greenBox
    E4["Supplier Bidding History"]:::greenBox

    G1["Login / Signup"]:::yellowBox
    G2["User Profile"]:::yellowBox
    G3["Log Out"]:::yellowBox

    A[Homepage Internal]:::homepage --> B(Create);
    A --> C(Status);
    A --> D(Bidding);
    A --> E(Supplier);
    A --> F(HELP);
    A --> G(ACCOUNT);

    %% Create Menu
    B --> B1(Create Purchase Request);
    B --> B2(Create Purchase Order);
    B --> B3(Create Material Code);
    B --> B4(Create Expedite);
    B --> B5(Create Payment);

    %% Status Menu
    C --> C1(PR - PO Status);
    C --> C2(Delivery Status);
    C --> C3(Payment Status);
    C --> C4(Real-Time Statistics);

    %% Bidding Menu
    D --> D1(Sourcing Project);

    %% Supplier Menu
    E --> E1(Supplier Information);
    E --> E2(Supplier Request / Registration);
    E --> E3(Supplier Ranking / Grouping);
    E --> E4(Supplier Bidding History);

    %% Account Menu
    G --> G1(Login / Signup);
    G --> G2(User Profile);
    G --> G3(Log Out);


```
```mermaid
graph TD
    %% Style Definitions (Yellow Box = MVP, Green Box = Additional Features)
    classDef homepage fill:#7B7B7B,stroke-width:2px,color:#fff
    classDef greenBox fill:#009100,stroke-width:2px,color:#fff
    classDef yellowBox fill:#A6A600,stroke-width:2px,color:#fff
    classDef blueBox fill:#0072E3,stroke-width:2px,color:#fff
    classDef loginBox fill:#2d5016,stroke-width:3px,color:#fff

    I1["Update Company Information Request"]:::yellowBox
    I2["Update Supply Information Request"]:::greenBox
    
    J1["Submit Quotation"]:::yellowBox
    J2["Sourcing Project Status"]:::yellowBox
    J3["Purchase Order Recieved"]:::yellowBox

    K1["Submit Expedition Status"]:::greenBox
    K2["Update Expedition Status"]:::greenBox

    L1["Submit Invoice"]:::greenBox
    L2["Invoice Status"]:::greenBox

    H[Homepage Supplier]:::homepage-->I(Account);
    H --> J(Quotation);
    H --> K(Expedition);
    H --> L(Invoice);

    %% Account
    I --> I1(Update Company Information Request);
    I --> I2(Update Supply Information Request);

    %% Quotation
    J --> J1(Submit Quotation);
    J --> J2(Sourcing Project Status);
    J --> J3(Purchase Order Recieved);

    %% Expedition
    K --> K1(Submit Expedition Status);
    K --> K2(Update Expedition Status);

    %% Invoicing
    L --> L1(Submit Invoice);
    L --> L2(Invoice Status);
```
