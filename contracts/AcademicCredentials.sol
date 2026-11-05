// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract AcademicCredentials {
    address public immutable owner;
    mapping(address => bool) public authorizedIssuers;
    enum Status { None, Issued, Revoked }
    struct Credential { address issuer; bytes32 merkleRoot; uint64 issuedAt; uint64 version; Status status; }
    mapping(bytes32 => Credential) private credentials;
    event IssuerAuthorized(address indexed issuer);
    event IssuerRemoved(address indexed issuer);
    event CredentialIssued(bytes32 indexed id,address indexed issuer,bytes32 root);
    event CredentialRevoked(bytes32 indexed id,address indexed issuer,uint64 version);
    error NotOwner(); error NotIssuer(); error AlreadyExists(); error NotOriginalIssuer(); error NotIssued(); error InvalidInput();
    constructor(){owner=msg.sender;authorizedIssuers[msg.sender]=true;}
    modifier onlyOwner(){if(msg.sender!=owner) revert NotOwner();_;}
    function authorizeIssuer(address issuer) external onlyOwner {if(issuer==address(0))revert InvalidInput();authorizedIssuers[issuer]=true;emit IssuerAuthorized(issuer);}
    function removeIssuer(address issuer) external onlyOwner {authorizedIssuers[issuer]=false;emit IssuerRemoved(issuer);}
    function issueCredential(bytes32 id,bytes32 root) external {
        if(!authorizedIssuers[msg.sender])revert NotIssuer();
        if(id==bytes32(0)||root==bytes32(0))revert InvalidInput();
        if(credentials[id].status!=Status.None)revert AlreadyExists();
        credentials[id]=Credential(msg.sender,root,uint64(block.timestamp),1,Status.Issued);
        emit CredentialIssued(id,msg.sender,root);
    }
    function revokeCredential(bytes32 id) external {
        Credential storage c=credentials[id];
        if(c.issuer!=msg.sender)revert NotOriginalIssuer();
        if(c.status!=Status.Issued)revert NotIssued();
        c.status=Status.Revoked;c.version++;emit CredentialRevoked(id,msg.sender,c.version);
    }
    function getCredential(bytes32 id) external view returns(Credential memory){return credentials[id];}
    // Leaf = SHA256(UTF8(field) || 0x1f || UTF8(value) || 0x1f || UTF8(salt)).
    // Each proof element specifies whether the sibling is to the left.
    function verifyDisclosure(bytes32 id,string calldata field,string calldata value,string calldata salt,bytes32[] calldata siblings,bool[] calldata siblingLeft) external view returns(bool){
        Credential memory c=credentials[id];
        if(c.status!=Status.Issued||siblings.length!=siblingLeft.length)return false;
        bytes32 h=sha256(abi.encodePacked(field,bytes1(0x1f),value,bytes1(0x1f),salt));
        for(uint i=0;i<siblings.length;i++){
            h=siblingLeft[i]?sha256(abi.encodePacked(siblings[i],h)):sha256(abi.encodePacked(h,siblings[i]));
        }
        return h==c.merkleRoot;
    }
}
