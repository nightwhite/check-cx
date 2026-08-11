## ADDED Requirements
### Requirement: Configurable Site Favicon
The system SHALL allow the single site to define a dedicated favicon URL independent from the site logo URL.

#### Scenario: Admin saves favicon URL
- **WHEN** an admin updates site settings with a valid http/https `faviconUrl`
- **THEN** the system stores and returns that URL in site settings responses

#### Scenario: Public favicon request uses configured URL
- **WHEN** a browser requests `/favicon.ico` and the site has a configured `faviconUrl`
- **THEN** the Worker returns the icon content from that configured URL
