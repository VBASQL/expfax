# FaxBack Portal API — Developer Reference

A markdown reference distilled from the FaxBack Portal API Developer Reference (last edited Feb 18, 2021). Covers session management, accounts, groups, DIDs, domains, messaging (send/receive), and supporting object schemas.

---

## Table of Contents

1. [Overview](#overview)
2. [URLs](#urls)
3. [Session Management](#session-management)
4. [Account Management](#account-management)
5. [Cover Template Management](#cover-template-management)
6. [Email Alias Management](#email-alias-management)
7. [Group Management](#group-management)
8. [DID Management](#did-management)
9. [Domain Management](#domain-management)
10. [Messaging](#messaging)
11. [API Object References](#api-object-references)
12. [API Tester](#api-tester)

---

## Overview

The FaxBack Portal API is a REST service that supports both XML and JSON request/response formats. The data type is specified in the request header (`Content-Type: text/xml` or `application/json`) or via the URL.

### Common Workflows

**Create an Account**
1. `Login` → receive `LoginId`
2. `AddAccount` (passing `LoginId`) → receive new account's GUID

**Send a Fax**
1. `Login` → receive `LoginId`
2. `SendMessage` → receive a message handle
3. (optional) `ReadMessage` to track completion
4. `DeleteMessage` to remove from the database (essential)

**Receive a Fax**
1. `Login` → receive `LoginId`
2. `ReadQueue` → poll for a list of message handles
3. `BuildFaxImage` → download the message content
4. `DeleteMessage` to remove from the database (essential)

---

## URLs

**Local server:**
```
http://{nsx-server}:81/mqs/{service}/{method}
```

**NativeFax (cloud):**
```
https://api.nativefax.net/rest/{service}/{method}
https://sandbox.nativefax.net/rest/{service}/{method}
```

**Examples:**
- `https://api.nativefax.net/rest/nsx/Login`
- `https://api.nativefax.net/rest/mqs/Accounts/AddAccount?LoginId={MyLoginId}`
- `https://api.nativefax.net/rest/mqs/Groups/ReadGroupGuids?LoginId={MyLoginId}`
- `https://api.nativefax.net/rest/Messages/SendMessage?LoginId={MyLoginId}`

---

## Session Management

### Login

Establishes a session with supplied credentials.

**Request (POST):** `https://api.nativefax.net/rest/nsx/Login`

```xml
<NSX>
  <Credentials>
    <UserName>AccountManagement</UserName>
    <Password>B1ueSky27#</Password>
  </Credentials>
</NSX>
```

**Responses:**
| Code | Meaning |
|------|---------|
| 200 OK | Returns `<LoginId>` GUID |
| 400 Bad Request | Missing credentials (`20578342/0x13A0026`) |
| 401 Unauthorized | Invalid password (`19988534/0x1310036`) |
| 404 Not Found | User not found (`19988533/0x1310035`) |

**Successful response:**
```xml
<NSX>
  <LoginId>ea37be81-079a-4700-8265-c7eee3341c81</LoginId>
</NSX>
```

### RefreshId

A lightweight call to keep a `LoginId` alive at the server. Sessions time out after five minutes of inactivity. No body, no response body — just a `LoginId` in the URL.

**Request (GET):** `https://api.nativefax.net/rest/nsx/RefreshId?LoginId={MyLoginId}`

If the response is **401 Unauthorized**, the client should call `Login` again using cached credentials rather than reporting an error to the user.

### Logout

**Request (GET):** `https://api.nativefax.net/rest/nsx/Logout?LoginId={MyLoginId}`

Returns `204 No Content` on success.

---

## Account Management

### ReadAccountGuids

Returns a list of all account GUIDs in the calling user's domain.

**Request (GET):** `https://api.nativefax.net/rest/mqs/Accounts/ReadAccountGuids?LoginId={MyLoginId}`

**Response:**
```xml
<AccountGuids>097dfbe1-0cee-4653-9209-af6fc258675b,f745169e-2b53-461e-8376-65d723a0026d,...</AccountGuids>
```

**Optional URL parameters:**
| Parameter | Purpose |
|-----------|---------|
| `OrderBy` | SQL ORDER BY syntax (e.g. `Company ASC`) |
| `GroupId` / `GroupGuid` | Limit to members of a specific group |
| `DomainId` / `DomainGuid` | Specify source domain (when calling user has multi-domain access) |
| `Login=1` | Return only accounts that are currently logged in |

**Sortable column names:**
`AccountGuid, AccountId, Description, Customer, Source, CDRInfo, CSID, TSID, ANI, SaveCDR, CallAhead, ClientLogs, LoginGroup, RuleGroup, AllowSnd, AllowRcv, AllowSndOnBehalfOf, RcvFailoverGuid, RcvFailoverMode, ProvisioningArg, SerialNumber, MACAddress, EmailCoverType, UseCoverPage, CoverPage, BillingCode, ClientType, First, Middle, Last, Address1, Address2, City, State, PostalCode, Country, Company, ContactEmail, OfficePhone, CellPhone, QueueProfileXml, RawXml, DomainGuid, DomainId, CreatedOn, LastModified`

### ReadAccountBlock

Returns details for accounts identified by the GUIDs returned from `ReadAccountGuids`.

**Request (POST):** `https://api.nativefax.net/rest/mqs/Accounts/ReadAccountBlock?LoginId={MyLoginId}`

```xml
<NSX>
  <AccountGuids>097dfbe1-0cee-4653-9209-af6fc258675b,f745169e-2b53-461e-8376-65d723a0026d</AccountGuids>
</NSX>
```

**Limit returned columns** by adding an `<Include>` node:
```xml
<NSX>
  <AccountGuids>...</AccountGuids>
  <Include>AccountId,CreatedOn</Include>
</NSX>
```

**CSV response:** add `?As=CSV` to the URL.

**Login details:** add `Login=1` to the URL to include `LoginId`, `ClientInfo`, `LoginSrvId`, `LoginSrvGuid`, `LoginCreatedOn`, and `LoginLastModified` for any active client sessions.

### ReadAccount

Read a single account by ID, GUID, DID, MAC address, serial number, or send-email address.

```
ReadAccount?LoginId={MyLoginId}&AccountId={MyAccountId}
ReadAccount?LoginId={MyLoginId}&AccountGuid={MyGuid}
ReadAccount?LoginId={MyLoginId}&DID={MyDID}
ReadAccount?LoginId={MyLoginId}&MacAddress={MyMac}
ReadAccount?LoginId={MyLoginId}&SerialNumber={MySN}
ReadAccount?LoginId={MyLoginId}&SndEmailAddress={MySnd}
```

### AddAccount

Adds a new account. Example: a Fax ATA account with two lines.

**Request (POST):** `https://api.nativefax.net/rest/mqs/Accounts/AddAccount?LoginId={MyLoginId}`

```xml
<NSX>
  <Account>
    <AccountId>FaxATA-D013579876</AccountId>
    <PasswordStr>B1ueSky27#</PasswordStr>
    <ClientType>1</ClientType>
    <Lines>
      <FaxLine>
        <DID>5057071234</DID>
        <AnswerIncoming>1</AnswerIncoming>
        <OverrideProfile>
          <delivery_ntf>1</delivery_ntf>
          <email_format>0</email_format>
          <header_strip_count>0</header_strip_count>
          <non_delivery_ntf>1</non_delivery_ntf>
          <timezone_id>Pacific*</timezone_id>
        </OverrideProfile>
        <LineNum>0</LineNum>
        <LineId>Line 1</LineId>
        <CSID>5057071234</CSID>
        <TSID>5057071234</TSID>
        <ANI>5057071234</ANI>
        <ReceiveClient>1</ReceiveClient>
      </FaxLine>
      <!-- additional FaxLine entries -->
    </Lines>
    <AllowSend>True</AllowSend>
    <ATAProperties>
      <CallAhead>0</CallAhead>
      <SerialNumber>D013579876</SerialNumber>
      <ClientLogging>0</ClientLogging>
    </ATAProperties>
  </Account>
</NSX>
```

**Response:** `<AccountGuid>758a0dff-f5f7-4e38-a96c-cbc1301890fa</AccountGuid>`

**Notable parameters:**

| Parameter | Purpose |
|-----------|---------|
| `UseCoverPage` | Whether the account uses a cover page |
| `RcvFailoverMode` | Bit flags: 0=Default, 1=Always, 2=GroupMember, 4=RequirePrimaryLoggedIn |
| `RcvFailoverGuid` | Account/group GUID for receive failover. `01000000-...` = global Transmission Group; all-zero GUID with ATA/Email/FAXability/MSFax type implicitly sets the global Transmission Group |

### ModifyAccount

You must include an `AccountGuid`. Only properties that are present in the request are changed. Supervisors can modify any account in their domain; users can only modify their own.

**Request (POST):** `https://api.nativefax.net/rest/mqs/Accounts/ModifyAccount?LoginId={MyLoginId}`

```xml
<NSX>
  <Account>
    <AccountGuid>097dfbe1-0cee-4653-9209-af6fc258675b</AccountGuid>
    <Description>My description</Description>
  </Account>
</NSX>
```

**Supervisor-only properties** (a non-supervisor attempting to modify these gets "access denied"): `AllowSnd`, `AllowRcv`, `ReceiveFailoverGuid`.

For `RcvFailoverGuid`, an all-zero value clears failover (no receive failover).

### DeleteAccount

**Request (POST):** `https://api.nativefax.net/rest/mqs/Accounts/DeleteAccount?LoginId={MyLoginId}`

```xml
<NSX>
  <Account>
    <AccountGuid>097dfbe1-0cee-4653-9209-af6fc258675b</AccountGuid>
  </Account>
</NSX>
```

**Optional parameter:** `DeleteDIDs=1` also deletes DIDs associated with the account (default behavior unlinks the DIDs but keeps them in the domain).

### GetGroupMemberships

Lists all groups for which the account is a member. Provide `GroupId`/`GroupGuid` to test for membership in a specific group; provide `<Include>` to limit returned columns; add `?as=csv` for INI-style output.

**Request (POST):** `https://api.nativefax.net/rest/mqs/Accounts/GetGroupMemberships?LoginId={MyLoginId}`

```xml
<NSX>
  <Include>GroupId</Include>
</NSX>
```

A supervisor can query another account's memberships by including `<Account><AccountGuid>...</AccountGuid></Account>`.

---

## Cover Template Management

A supervisor can manage any user's cover templates; a regular user can only manage their own. If a user has no cover specified, the supervisor's default template is used. **There is no `ModifyTemplate`** — use `AddTemplate` with `FailIfExists=false`.

### Cover Replacement Fields

| Parameter | Meaning |
|-----------|---------|
| `$(SubmitTime)` | Submission time |
| `$(Date)` | Submission date |
| `$(Cover)` | Message body text |
| `$(SenderName)` | Sender name |
| `$(SenderFax)` | Sender fax phone |
| `$(SenderVoice)` | Sender voice phone |
| `$(SenderCompany)` | Sender company |
| `$(From)` | Replacement for `$(SenderName)` looked up from the email address |
| `$(To)` | Comma-separated list of all non-CC/BCC email destinations |
| `$(Cc)` | Comma-separated list of CC destinations; BCC appears as `(bcc: ...)` wrapped on word boundary |
| `$(ReceiverCompany)` | Recipient company |
| `$(ReceiverName)` | Recipient name (single recipient per cover page) |
| `$(Subject)` | Message subject |

### Template Properties

`TemplateGuid`, `TemplateName`, `TemplateSize`, `TemplateHash`, `DomainGuid`, `DomainId`, `DataSource`, `CreatedOn`, `LastModified`.

### GetTemplates

**Request (GET):** `https://api.nativefax.net/rest/mqs/Accounts/GetTemplates?LoginId={MyLoginId}`

Use `<Include>TemplateName,TemplateGuid</Include>` to limit columns. Add `&as=CSV` for CSV output. Add `&AccountGuid={guid}` (or `AccountId`) to retrieve another user's templates.

**Response:**
```xml
<NSX>
  <DefaultTemplate>MyCoverTest.rtf</DefaultTemplate>
  <DefaultEnabled>1</DefaultEnabled>
  <Templates>
    <Template>
      <TemplateGuid>8946dd1b-93a1-4efb-a8cf-8d1aa97ab579</TemplateGuid>
      <TemplateName>CoverPage.rtf</TemplateName>
      <TemplateSize>41965</TemplateSize>
      <TemplateHash>61972EB9F927BA299CAF964F9D1D4F1C</TemplateHash>
      <DomainGuid>2cd5477c-e8bd-4857-8db3-9de10082e3c8</DomainGuid>
      <DomainId>DevSandBox Domain</DomainId>
      <DataSource />
      <CreatedOn>2019-07-17 17:11:38Z</CreatedOn>
      <LastModified>2019-07-17 17:11:38Z</LastModified>
    </Template>
  </Templates>
</NSX>
```

### GetTemplateContent

**Request (GET):** `https://api.nativefax.net/rest/mqs/Accounts/GetTemplateContent?LoginId={MyLoginId}&TemplateGuid={MyGuid}`

Returns the raw file (e.g. `Content-Type: text/rtf`) — designed to be browser-downloadable.

### AddTemplate (XML/JSON)

**Request (POST):** `https://api.nativefax.net/rest/mqs/Accounts/AddTemplateContent?LoginId={MyLoginId}`

```xml
<NSX>
  <Template>
    <TemplateName>Test.rtf</TemplateName>
    <ContentData>VGhpcyBpcyBhIHRlc3Qu</ContentData>
    <FailIfExists>False</FailIfExists>
    <DefaultTemplate>True</DefaultTemplate>
  </Template>
</NSX>
```

**Response:** `<TemplateGuid>02237e97-15aa-45ca-b331-9ae6a1433878</TemplateGuid>`

### AddTemplate via Form POST

Alternative multipart form-data upload. **Form fields:**

| Field | Purpose |
|-------|---------|
| `DefaultTemplate` | `1` to set as account's default |
| `Document` | The file upload |
| `FailIfExists` | `1` to error rather than replace |
| `Password` | Account password |
| `ResponseBody` / `ResponseBodyBase64` | HTML template for response (placeholders `$(Id)`, `$(ErrNum)`, `$(ErrStr)`). Base64 form is recommended |
| `TemplateName` | Display name for the template |
| `UserName` | Account to add the template to |

Default success response: `<CoverTemplateGuid>,0,Ok`
Default failure: `,20578361,Cover page template already exists`

### DeleteTemplate

**Request (GET):** `https://api.nativefax.net/rest/mqs/Accounts/DeleteTemplate?LoginId={MyLoginId}&TemplateGuid={guid}`

Returns `204 No Content`.

---

## Email Alias Management

### GetEmailAliases

**Request (POST):** `https://api.nativefax.net/rest/mqs/Accounts/GetEmailAliases?LoginId={MyLoginId}`

```xml
<NSX>
  <Include>EmailAlias</Include>
</NSX>
```

`<Include>` may contain any of: `EmailAlias, AccountGuid, AccountId, RawXml, DomainGuid, DomainId, CreatedOn, LastModified`.

### CreateEmailAlias / DeleteEmailAlias

```xml
<NSX>
  <Account>
    <EmailAlias>fred@wilmaco.com</EmailAlias>
  </Account>
</NSX>
```

`Delete` returns `204 No Content`.

### GetATAs

Lists ATAs from the Provisioning Server's ATAs table. NSX must be configured to know where to find this table.

**Optional parameters:**

| Parameter | Purpose |
|-----------|---------|
| `CSV` (node) or `?As=CSV` | INI-style response |
| `Include` | Comma-separated column list |
| `OrderBy` | Sort columns (e.g. `ProviderId,SerialNumber`) |
| `Unassigned` (node) or `?Unassigned=1` | Only ATAs not assigned to any user |

**Columns when getting unassigned ATAs:** `SerialNumber, ProviderId, ProviderGuid, Status, Location, Description, CreatedOn, LastModified`. Assigned ATAs additionally include `AccountGuid, AccountId`.

---

## Group Management

### ReadGroupGuids

**Request (GET):** `https://api.nativefax.net/rest/mqs/Groups/ReadGroupGuids?LoginId={MyLoginId}`

**Response:**
```xml
<GroupGuids>05ff6dd6-...,1e49bf32-...,81878b7e-...,cc859b5a-...</GroupGuids>
```

**Sortable columns:** `GroupGuid, GroupId, GroupType, MemberRouting, AllowRcv, RawXml, DomainGuid, DomainId, CreatedOn, LastModified`. Add `&DomainGuid=...` for cross-domain queries.

### ReadGroupBlock / ReadGroup

`ReadGroupBlock` takes a comma-separated list of `<GroupGuids>` and returns full group records. `ReadGroup` reads a single group by `GroupId`, `GroupGuid`, or associated `DID`.

### AddGroup

**Request (POST):** `https://api.nativefax.net/rest/mqs/Groups/AddGroup?LoginId={MyLoginId}`

```xml
<NSX>
  <Group>
    <GroupId>My New Group</GroupId>
  </Group>
</NSX>
```

**Parameters:**
| Parameter | Purpose |
|-----------|---------|
| `GroupId` | Group name |
| `GroupType` | (account vs. load-balance) |
| `MemberRouting` | For load-balance groups: 0=Alternating, 1=MostFree, 2=Random |
| `AllowRcv` | For load-balance groups: enable receive |

### ModifyGroup / DeleteGroup

`DeleteGroup` optional parameters:
| Parameter | Purpose |
|-----------|---------|
| `DeleteDIDs=1` | Also delete associated DIDs |
| `FailIfMembers=1` | Error if the group has members (default removes members automatically) |

### AddGroupMembers / RemoveGroupMembers

```xml
<NSX>
  <Group>
    <GroupGuid>834B166D-7938-41B9-9EF9-8DD02EBC8528</GroupGuid>
    <AccountGuids>62D11CB4-...,444CB3FF-...</AccountGuids>
  </Group>
</NSX>
```

---

## DID Management

### ReadDIDBlock

Read a group of DID records from a list of DID GUIDs.

**Request (POST):** `https://api.nativefax.net/rest/mqs/DIDs/ReadDIDBlock?LoginId=${MyLoginId}`

Body: `<DIDGuids>5b6fc1fc-...,787769f4-...</DIDGuids>`

### ReadDIDGuids

Reads every DID known to a domain, or DIDs mapped to a specific account/group.

| URL parameter | Purpose |
|---------------|---------|
| (none) | All DIDs in the calling user's domain |
| `&AccountGuid={guid}` | Only DIDs routed to that account/group |
| `&Unassigned=1` | Only DIDs not assigned to any account/group |
| `&OrderBy=DID` | SQL-style ordering |
| `&DomainId={guid}` | (topmost domain admins) all DIDs from a specific domain |

**Sortable columns:** `DIDGuid, RouteToGuid, RouteToId, RouteToType, DID, Customer, Source, LineId, LineNum, TSID, CSID, ANI, RcvAnswer, RcvFwdToGuid, QueueProfileXml, RawXml, DomainGuid, DomainId, CreatedOn, LastModified`.

### AddDID

```xml
<NSX>
  <DID>
    <DID>5035550001</DID>
    <RouteToGuid>36b2be3b-b427-4255-88a9-809061b4b1bf</RouteToGuid>
  </DID>
</NSX>
```

If `RouteToGuid` is included, the DID is created and assigned to that account/group in one call.

**`SndTransport` parameter:** specifies allowed send transports for ATAs.
- Empty or `"*"` → fax only
- Comma-separated list of transport ids (e.g. `"MaxMD"`) → only those transports
- Mixed list including `"*"` (e.g. `"*,MaxMD"`) → falls back to regular fax if no transport plugin accepts the dial number

### ModifyDID

`DIDGuid` is the only required field. Only provided properties are changed. To return a DID to the unassigned pool, set `<RouteToGuid>00000000-0000-0000-0000-000000000000</RouteToGuid>`.

### DeleteDID

Specify either `<DID>` or `<DIDGuid>`. Returns `204 No Content`.

### ReadDID

Read a single DID by `DID` or `DIDGuid` in the URL query.

#### Receive Routing

Add `<ReceiveRouting>1</ReceiveRouting>` (along with `<Include>` and `<AccountColumns>`) to the request. The server applies receive routing logic:
1. Returns `NSX_MSG_CLASS.DID_DISABLED` if `RcvAnswer` is set to Never.
2. Follows `RcvFwdToGuid` until a record is found where it isn't set.
3. Keeps the `QueueProfileXml` from the first DID in the chain that overrides the account-level QPXml.

The response includes a `<Routing>` node with the merged QueueProfileXml (DID + account + domain defaults).

---

## Domain Management

### GetDomain (a.k.a. GetDomains)

Returns all NSX domains under a parent in Object Directory. For topmost domain supervisors, the parent is `[Resources]`. For subdomain supervisors, the parent is the caller's domain (and the response includes the parent at the top).

**Request (POST):** `https://api.nativefax.net/rest/nsx/GetDomains?LoginId={MyLoginId}`

Returns a hierarchical `<Domains>` tree of `<Domain>` entries with `Id`, `Guid`, `Type` (114 = Domain).

### CreateDomain

Creates a new NSX domain. Default groups (All Users, Routers, Supervisors, System Users) are created automatically. Optional default supervisor and postmaster users can be created — but all user names are unique system-wide, so only one "Supervisor" can exist.

```xml
<NSX>
  <Credentials>
    <UserName>TestDomainAdmin</UserName>
    <Password>TestDomainPassword</Password>
  </Credentials>
  <ParentGuid>2cd5477c-e8bd-4857-8db3-9de10082e3c8</ParentGuid>
  <DomainId>TestDomain</DomainId>
</NSX>
```

### ModifyDomain

| Parameter | Meaning |
|-----------|---------|
| `DomainGuid` or `DomainIdToModify` | Identifies the domain |
| `DomainId` | Optional new name |

### DeleteDomain

Deletes the entire domain including all users, groups, and message queues.

```xml
<NSX>
  <DomainGuid>fa18778b-7635-4d62-b2b1-1ed74ec26eca</DomainGuid>
</NSX>
```

### GetAccountDomains

Lists domains the account is in and the rights it has. `Primary=1` indicates the domain in which the account was created. `Primary=0` indicates a mapped domain (typically with supervisory rights).

### GetDomainInfo

Validates a domain exists. With `<QueueInfo>1</QueueInfo>`, it also returns queue counts (`Send`, `Sending`, `Sent`, `Receiving`, `Received`) per fax engine plus totals.

---

## Messaging

### SendMessage

Sends a message to one or more recipients. Can be submitted as XML/JSON or as a multipart form post.

**Top-level parameters:**

| Parameter | Purpose |
|-----------|---------|
| `ActionTypes` | Default deletes the message; set `"ClientOutbox"` to keep it in the user's outbox |
| `AppInfo` | Custom string stored with the message |
| `CoverMode` | 0=Server config, 1=No cover, 2=All recipients on one cover, 3=One cover per recipient |
| `CoverTemplate` | Cover template name (defaults to user's, then supervisor's) |
| `NoPageHeader` | `1` to skip page headers |
| `RecipientMode` | 0=accept if any recipient valid (default), 1=reject if any invalid, 2=validation test only |
| `ResponseBody` / `ResponseBodyBase64` | HTML response template with `$(Id)`, `$(ErrNum)`, `$(ErrStr)` placeholders |
| `Resolution` | Bit flags: `HUFFMAN=1`, `TWO_D_HUFFMAN=2`, `T6=4`, plus DPI/width bits below |
| `Schedule` | UTC datetime for delayed delivery (e.g. `2017-07-09 18:30:00Z`) |
| `SenderCompany`, `SenderName`, `SenderFaxNumber`, `SenderVoiceNumber`, `Subject` | Cover-page field values |
| `MessageBillingCode` | Saved with the eventual CDR |
| `RetryCountOverride` | -1=no retries, 0=server default, >0=specific retries |

**Recipient sub-fields:**

| Field | Purpose |
|-------|---------|
| `Address` | Fax number to dial |
| `Name` | Used for cover page |
| `Prefix` | 0=To, 1=Cc, 2=Bcc |
| `LocalCSId` | Override the TSID seen by the remote device |
| `CallerId` | Override the ANI for the call |

**Document sub-fields:**

| Field | Purpose |
|-------|---------|
| `DocumentPart` | 0=CoverMessage, 1=Document |
| `DocumentType` | 0=Unknown, 1=TIFF, 2=RTF, 3=PDF, 4=HTML, 5=TEXT |
| `Name` | Document name |
| `ContentText` | Inline text content (XML/JSON) |
| `ContentData` | Base64-encoded content (XML/JSON) |
| `PaperSize` | 0=Letter (default), 1=Legal, 2=GovLetter, 3=GovLegal, 4=Tabloid, 5–7=A3/A4/A5, 8–10=B3/B4/B5, 11–13=C3/C4/C5 |

The page width must remain consistent across the message (215mm = Letter/A4 is most widely supported).

**Example (cover-only send):**

```xml
<NSX>
  <SendMessage>
    <Subject>subject of the message</Subject>
    <AppInfo>custom data</AppInfo>
    <Recipient>
      <Name>fred</Name>
      <Address>555-111-2222</Address>
    </Recipient>
    <Document>
      <DocumentPart>0</DocumentPart>
      <ContentText>This is the content for the cover page.</ContentText>
    </Document>
  </SendMessage>
</NSX>
```

**Response:** `<MessageHandle>S-9423d504-4e36-4b3c-bda3-b2e784cb8b04</MessageHandle>`

#### Validation Test (`RecipientMode=2`)

No message is actually submitted. The server runs each recipient through validation and returns per-recipient `<Status>` / `<StatusNum>` blocks plus an overall result.

#### HTML Form POST

NSX server interprets all form-data as node names/values. Recipients and Documents use brace-delimited sections:

```
Content-Disposition: form-data; name="Recipient{"
...
Content-Disposition: form-data; name="Name"
Fred
...
Content-Disposition: form-data; name="Address"
555-222-3333
...
Content-Disposition: form-data; name="}"
```

**Three ways to attach document content:**
1. Provide file content directly in the `Document{` form-data variable.
2. Upload the file separately and reference it by index with `FileName` of the form `[0]`, `[1]`, etc.
3. Upload the file separately and reference it by form-data variable name in `FileName`.

**Default success response:**
```
S-ecb9f0da-0221-414d-872b-3b3edca5ac88,0,Ok
```

**Default failure response:**
```
,20578353,All recipients failed validation
```

By default browser callers always get `200 OK`. Add `?NonBrowser=1` to receive proper HTTP error codes (e.g. `400 Bad Request`).

### ReadQueue

Reads a comma-delimited list of message handles from a server queue.

**URL example:** `?Queue=Sent&LoginId={MyLoginId}`

| Parameter | Purpose |
|-----------|---------|
| `Queue` | `Send`/`0`, `Sending`/`1`, `Sent`/`2`, `Receiving`/`3`, `Received`/`4` |
| `OrderBy` | Column names (append ` DESC` for descending) |
| `AllUsers=1` | Supervisor-only: include all users' messages |
| `AccountId` / `AccountGuid` | Supervisor-only: query a specific user |
| `Count` | Maximum messages to return |
| `ActionType` | Filter by action type (defaults: `ClientOutbox` for send queues, `ClientInbox` for receive queues) |

**Sortable columns (send queues):** `AccountId, Status, StatusNum, Address, CallerID, LocalCSID, RemoteCSID, StartTime, Error, ErrorNumber, ExtendedErrorCode, DialSeconds, ConnectSeconds, TotalSeconds, ConnectBPS, Retries, Resolution, PageCount, PagesTransferred, SipCallId, ReceiverName, SenderName`.

**Sortable columns (receive queues):** `AccountId, Address, CallerID, LocalCSID, RemoteCSID, StartTime, Error, ErrorNumber, ExtendedErrorCode, TotalSeconds, ConnectBPS, Resolution, PageCount`.

#### Queue ↔ dbFax Routing Targets

| Queue | dbFax Receive Target |
|-------|---------------------|
| Receiving | Receiving |
| Received | PostFaxAction or ActionRequired |
| ReceivePendingDeletion | PendingDeletion |

| Queue | dbFax Send Target |
|-------|------------------|
| Send | New, Convert, or FaxSend |
| Sending | InTransmission |
| Sent | PostFaxAction or ActionRequired |
| SendPendingDeletion | PendingDeletion |

### ReadMessageBlock

Reads a collection of messages identified by a list of handles.

```xml
<NSX>
  <MessageHandles>
    S-22b73931-...,S-7c9fc59c-...
  </MessageHandles>
</NSX>
```

**Important:** pass the same `ActionType` to `ReadMessageBlock` that was used in `ReadQueue`.

### BuildFaxImage

Returns the entire content of a sent or received fax message in a single image file.

**HTTP GET:** returns the image file directly with `Content-Disposition: attachment`. Add `&DocumentType=PDF` to receive a PDF instead of TIFF.

```
GET /mqs/Messages/BuildFaxImage?MessageHandle=R-ece3100a-...&LoginId={MyLoginId}
```

**HTTP POST:** returns the content base64-encoded inside a `<ContentData>` node, wrapped in an `<HttpService>`/`<NSXResponse>`/`<BuildFaxImageResponse>` envelope.

```xml
<HttpService>
  <NSX>
    <BuildFaxImage>
      <MessageHandle>R-ece3100a-b996-4b15-9915-3394f03dbd60</MessageHandle>
    </BuildFaxImage>
  </NSX>
</HttpService>
```

### ReadMessage

Reads a single message by handle. Response includes routing history and full per-recipient transmission stats.

**Document type values:** 0=Unknown, 1=TIFF, 2=RTF, 3=PDF, 4=HTML, 5=TEXT.

**Resolution bit flags:**
| Value | Meaning |
|-------|---------|
| 1 | HUFFMAN |
| 2 | TWO_D_HUFFMAN |
| 4 | T6 |
| 16 | JPEG |
| 32 | COLOR |
| 256 | DPI 200H × 100V |
| 512 | DPI 200H × 200V |
| 1024 | DPI 200H × 400V |
| 2048 | DPI 300H × 300V |
| 4096 | DPI 400H × 400V |
| 8192 | Width 255mm |
| 16384 | Width 303mm |

For received messages, the message-level `Status`/`StatusNum` mirror the only `<Recipient>`'s `Error`/`ErrorNumber`.

### DeleteMessage

Deletes one or more messages (multiple via comma-delimited handles).

```xml
<NSX>
  <Message>
    <MessageHandle>S-9b4b6e2e-6352-4ea6-aedd-b6215cd889e7</MessageHandle>
  </Message>
</NSX>
```

### AbortMessage

Aborts messages currently in the `Sending` or `Receiving` queue. Same body shape as `DeleteMessage`.

### GetQueueCounts

Returns counts for all (or one specified) account in a queue.

| Parameter | Purpose |
|-----------|---------|
| `AccountId` / `AccountGuid` | Restrict to one account |
| `ActionType` | Restrict to one action type |
| `AllUsers=1` | Supervisor-only: counts across all users |

**Response:**
```xml
<QueueCounts>
  <Send>1</Send>
  <Sending>0</Sending>
  <Sent>3</Sent>
  <Receiving>0</Receiving>
  <Received>0</Received>
  <FaxEngine>Default</FaxEngine>
</QueueCounts>
```

---

## API Object References

### Account Object

Selected properties (full table is exhaustive — see source PDF for every entry):

| Property | Description | ClientType | JSON example |
|----------|-------------|-----------|--------------|
| `AccountId` | Name of the account | All | `"AccountId": "MyAccount"` |
| `PasswordStr` | Account password | All | `"PasswordStr": "B1ueSky27#"` |
| `ClientType` | Bit flags: 0=None, 1=FaxATA, 2=Email, 4=FAXability, 8=MSFax/API, 16=Realtime (exclusive) | All | `"ClientType": "0"` |
| `AllowSnd` / `AllowRcv` | Enable send/receive | All | `"AllowSnd": "1"` |
| `Description` | Account description | All | `"Description": "Office"` |
| `Customer` / `Source` | Reference fields | ATA | `"Customer": "Medical Company"` |
| `CSID` / `TSID` / `ANI` | Call identity at the account level | All | `"CSID": "5415381234"` |
| `SaveCDR` | Save CDRs (default on) | All | `"SaveCDR": "1"` |
| `CallAhead` | Enable Call Ahead on Fax ATA | ATA | `"CallAhead": "1"` |
| `ClientLogs` | Send client logs to service | ATA | `"ClientLogs": "1"` |
| `LoginGroup` / `RuleGroup` | Fax ATA login/send-rule groups | ATA | `"LoginGroup": "GroupA"` |
| `AllowSndOnBehalfOf` | Send-on-behalf (mainly for ATA QP account) | Realtime | `"AllowSndOnBehalfOf": "1"` |
| `RcvFailoverGuid` / `RcvFailoverMode` | Receive failover target and mode | FaxATA | `"RcvFailoverMode": "1"` (Always) or `"5"` (Only when logged in) |
| `FaxATAType` | -1=Unknown, 0=MP202B, 1=MP202D, 2=MP264B, 3=LEXMARK, 4=FV_G201N4, 5=MP202R, 6=RN_QX300 | FaxATA | `"FaxATAType": "0"` |
| `SerialNumber` / `MACAddress` | ATA identifiers | FaxATA | `"SerialNumber": "D01234567"` |
| `EmailCoverType` / `UseCoverPage` / `CoverPage` | Cover-page settings | Email | `"CoverPage": "MyCoverPage.rtf"` |
| `BillingCode` | Account-level billing code | All | `"BillingCode": "A1B2C3"` |
| `PIN` / `PINMode` / `PINGuid` | Fax-to-Direct PIN settings | FaxATA | `"PINMode": "0"` |
| `Prefix`, `First`, `Middle`, `Last`, `Suffix` | Profile name | All | `"First": "John"` |
| `Address1`, `Address2`, `City`, `State`, `PostalCode`, `Country` | Profile address | All | `"City": "Portland"` |
| `Company`, `ContactEmail`, `OfficePhone`, `CellPhone` | Profile contact info | All | `"ContactEmail": "x@y.com"` |
| `SndTransport` | Send-transport restrictions for Fax-to-Direct | All | `"SndTransport": ""` |
| `QueueProfileXml` | Delivery & notification settings (see below) | All | (XML attribute object) |
| `RawXml.AdminNotes` | Free-form admin notes | All | `"RawXml": { "AdminNotes": "Notes" }` |
| `DomainGuid` / `DomainId` | Domain assignment | All | `"DomainId": "Topmost Domain"` |

`ContactEmail` is also used for password reset.

### QueueProfileXml Reference

| Attribute | Purpose |
|-----------|---------|
| `Tz` | Time zone |
| `Rt` | Receive type (bit OR): 1=ATA, 2=Email, 4=FAXability, 8=Client inbox |
| `Ea` | Email address for delivery notifications and received faxes |
| `Ef` | Email attachment format: 0=TIF, 1=PDF |
| `Dn` | Delivery notifications. 0=None; 1=ATA w/ thumbnail; `1/8`=ATA without thumbnail; 2=Email on; `2/1`=Email w/ faxed image; `2/2`=Email w/ original attachments; `2/3`=Email w/ both. Combine by adding (e.g. printed w/ thumbnail + email w/ both = `3/3`) |
| `Ndn` | Non-delivery notifications (same scheme as `Dn`) |
| `Ntfstart` | FAXability client delivery notifications: 1=Enabled, 0=Disabled |
| `Ln` | Language |

**JSON example:**
```json
"QPXml": {
  "@Tz": "Pacific*",
  "@Rt": "2",
  "@Ea": "NotARealEmail@faxback.com",
  "@Ef": "2",
  "@Dn": "2/1",
  "@Ndn": "2/2",
  "@Ntfstar": "1",
  "@Ln": "English"
}
```

### DID Object

| Property | JSON example |
|----------|--------------|
| `DID` | `"DID": "5411234567"` |
| `RcvAnswer` | `"RcvAnswer": "0"` (disabled) |
| `AccountId` | `"AccountId": "FaxATA-D01234567"` |
| `Customer` / `Source` | reference fields |
| `LineNum` | `"LineNum": "0"` |
| `LineId` | `"LineId": "5411234567"` |
| `CSID` | `"CSID": "5411234567"` |
| `PIN` / `PINMode` / `PINGuid` | Fax-to-Direct only |
| `SndTransport` | Fax-to-Direct only |
| `RcvFwdToGuid` | Forward-to GUID |
| `QPXml` | DID-level QueueProfileXml override |

### Group Object

Properties: `GroupId`, `GroupGuid`, `GroupType`, `MemberRouting`, `AllowRcv`, `RawXml`, `DomainGuid`, `DomainId`, `CreatedOn`, `LastModified`, `MembershipLastModified`.

---

## API Tester

A browser-based tool for exercising the API. It communicates directly from the browser, so the target service must support CORS (otherwise route via an HTTP proxy). The tester URL must use the same scheme (HTTP vs. HTTPS) as the target API.

### Features

- HTTP methods: `POST`, `GET`, `DELETE`
- Run JavaScript
- Load a single request from URL
- Load a sample set from URL with a sample selector dropdown
- Load/save requests and responses to local disk
- Multi-tab interface
- Convert XML ⇄ JSON
- Horizontal or vertical layout
- Single or multiple chained request/response sequences
- Conversions: `encodeURIComponent`/`decodeURIComponent`, base64 encode/decode, FaxBack PW2 scramble (encode/decode), FaxBack NS9 password scramble (encode only — not reversible), file ⇄ base64 string

### Multiple Request Inline Settings

| Token | Meaning |
|-------|---------|
| `//` | Comment |
| `// NAME:` | Name for subsequent response value lookup |
| `// URL:` | Service URL |
| `// METHOD:` | HTTP request type |
| `// HEADER:` | HTTP header to send (e.g. `Content-Type: application/json`) |
| `//-----` | Request separator |
| `${Name.Path}` | Substitute content from a previously-named response |

---

*Source: FaxBack, Inc. — Portal API Developer Reference, last edited February 18, 2021. Authors: Vin Delia, Derek Arduino, Quentin J. Dible, Mike Oliszewski.*
