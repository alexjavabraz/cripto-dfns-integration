// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC721Token
 * @notice Deployable ERC-721 NFT with configurable base URI, owner-controlled minting.
 */
contract ERC721Token is ERC721, Ownable {
    string private _baseTokenURI;
    uint256 private _nextTokenId;

    constructor(
        string memory name,
        string memory symbol,
        string memory baseURI,
        address owner
    ) ERC721(name, symbol) Ownable(owner) {
        _baseTokenURI = baseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function mint(address to) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        return tokenId;
    }
}
